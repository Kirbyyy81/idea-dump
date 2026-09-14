-- Isolated migrated database only. Every fixture and operator action rolls back.
begin;
create function pg_temp.check_v3(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$f$;
insert into auth.users(id) values('d3000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name)
select md5('v3-source-'||n)::uuid,'d3000000-0000-4000-8000-000000000001','Synthetic Source '||n from generate_series(1,8) n;
select public.finance_set_parser_learning_cutoff('d3000000-0000-4000-8000-000000000001','2026-09-01T00:00Z');

create function pg_temp.v3_fixture(kind int,n int,observed uuid default null,baseline_mode text default 'recorded',accepted boolean default true,uploaded timestamptz default clock_timestamp())
returns void language plpgsql as $f$
declare intake uuid:=md5('v3-intake-'||kind||'-'||n)::uuid; tx uuid:=md5('v3-tx-'||kind||'-'||n)::uuid;
 field text:=case kind when 4 then 'merchant' when 6 then 'transaction_date' else 'reference_number' end;
 corrected text:=case kind when 3 then '1200'||n when 4 then 'Synthetic Shop' when 5 then 'AB00'||n when 6 then '2026-07-15' else 'AB-'||n end;
 baseline text:=case when kind in (1,7,8) then 'OCR-AB-'||n when kind=2 then 'AB-'||n||'-COPY' when kind=3 then '12-00'||n else 'WRONG' end;
 ocr text:=case kind when 4 then E'Merchant\nSynthetic Shop' when 5 then 'Ref: {AB00'||n||'}' when 6 then 'Paid 15/07/2026' else 'Receipt' end;
 payload jsonb:='{}'; version int;
begin
 if baseline_mode='recorded' then payload:=jsonb_build_object('parser_template_baseline',jsonb_build_object('reference_number',baseline));
 elsif baseline_mode='null' then payload:='{"parser_template_baseline":{"reference_number":null}}'; end if;
 if observed is not null then
  select template_version into version from public.finance_parser_templates where id=observed;
  payload:=payload||jsonb_build_object('parser_template_evaluations',jsonb_build_array(jsonb_build_object(
   'template_id',observed,'algorithm_version',3,'template_version',version,'status','shadow','outcome','shadow',
   'value_hash',public.finance_template_value_hash_v2(field,corrected))));
 end if;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,ocr_normalized_text,original_filename)
 values(intake,'d3000000-0000-4000-8000-000000000001','screenshot','completed',uploaded,ocr,'synthetic.png');
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,merchant,intake_item_id)
 values(tx,'d3000000-0000-4000-8000-000000000001',md5('v3-source-'||kind)::uuid,'confirmed','expense',12.5,'2026-07-15','screenshot',
  case when field='reference_number' then corrected end,case when field='merchant' then corrected end,intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,payload,created_at)
 values(md5('v3-candidate-'||kind||'-'||n)::uuid,'d3000000-0000-4000-8000-000000000001',tx,intake,case when accepted then 'accepted' else 'pending' end,payload,clock_timestamp());
 insert into public.finance_corrections(user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value)
 values('d3000000-0000-4000-8000-000000000001',tx,intake,field,to_jsonb(baseline),to_jsonb(corrected));
end;
$f$;
select pg_temp.v3_fixture(kind,n) from generate_series(1,6) kind cross join generate_series(1,2) n;
select pg_temp.v3_fixture(kind,3,null,'recorded',false) from generate_series(1,6) kind;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_templates where algorithm_version=3),'two independent reviews plus pending cannot generate');
update public.finance_candidate_transactions set status='accepted';
select public.finance_refresh_rule_suggestions('d3000000-0000-4000-8000-000000000002');
select pg_temp.check_v3((select status='succeeded' and algorithm_version=3 and templates_proposed>0 from public.finance_learning_runs where invocation_id='d3000000-0000-4000-8000-000000000002'),'successful integrated run');
select pg_temp.check_v3((select count(distinct template_type)=6 from public.finance_parser_templates where algorithm_version=3),'all six types generated');
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_templates where algorithm_version=3 and (field_name='amount' or evidence_count<3)),'only supported non-amount definitions');
select pg_temp.check_v3(not exists(select 1 from public.finance_template_evidence e join public.finance_parser_templates t on t.id=e.template_id
 where e.algorithm_version=3 and (e.template_version<>t.template_version or e.value_hash is null)),'versioned hashed evidence');
create temporary table v3_before as select * from public.finance_parser_templates;
select public.finance_refresh_rule_suggestions('d3000000-0000-4000-8000-000000000002');
select pg_temp.check_v3(not exists(select * from public.finance_parser_templates except select * from v3_before),'invocation retry has no learning effects');

-- Only one selected rule receives three fresh runtime shadow observations.
create temporary table selected_v3 as select id from public.finance_parser_templates
 where algorithm_version=3 and template_type='strip_prefix' and scope_source_id=md5('v3-source-1')::uuid;
select pg_temp.check_v3((select count(*)=1 from selected_v3),'one deterministic prefix definition');
select pg_temp.check_v3(not public.finance_promote_parser_template_v2((select id from selected_v3)),'history cannot activate');
select pg_temp.v3_fixture(1,n,(select id from selected_v3)) from generate_series(4,5) n;
select pg_temp.check_v3(not public.finance_promote_parser_template_v2((select id from selected_v3)),'two fresh shadow reviews cannot activate');
select pg_temp.v3_fixture(1,6,(select id from selected_v3));
select pg_temp.check_v3(public.finance_promote_parser_template_v2((select id from selected_v3)),'three fresh reviewed observations can activate');

-- An active rule from either algorithm blocks overlapping promotion.
savepoint mixed_overlap;
insert into public.finance_parser_templates(id,user_id,template_key,scope_source_id,field_name,template_type,configuration,
 algorithm_version,template_version,learning_cutoff_at,evidence_count,evaluation_count,contradiction_count,precision)
values('d3000000-0000-4000-8000-000000000050','d3000000-0000-4000-8000-000000000001','synthetic-peer',
 md5('v3-source-1')::uuid,'reference_number','same_line_label','{"type":"same_line_label","label":"Ref"}',2,1,'2026-09-01T00:00Z',3,3,0,1);
update public.finance_parser_templates set status='shadow' where template_key='synthetic-peer';
update public.finance_parser_templates set shadow_started_at=clock_timestamp()-interval '1 day' where template_key='synthetic-peer';
insert into public.finance_template_evidence(template_id,user_id,candidate_id,intake_item_id,outcome,algorithm_version,evaluation_stage)
select 'd3000000-0000-4000-8000-000000000050',user_id,id,intake_item_id,'supported',2,'shadow'
 from public.finance_candidate_transactions where id in (select md5('v3-candidate-1-'||n)::uuid from generate_series(1,3) n);
select pg_temp.check_v3(not public.finance_parser_template_can_promote_v2('d3000000-0000-4000-8000-000000000050'),'active algorithm 3 blocks algorithm 2 overlap');
update public.finance_parser_templates set status='disabled',status_reason='operator_disabled' where id=(select id from selected_v3);
update public.finance_parser_templates set status='active' where template_key='synthetic-peer';
update public.finance_parser_templates set status='shadow' where id=(select id from selected_v3);
update public.finance_parser_templates set shadow_started_at=clock_timestamp()-interval '1 day' where id=(select id from selected_v3);
select pg_temp.check_v3(not public.finance_parser_template_can_promote_v2((select id from selected_v3)),'active algorithm 2 blocks algorithm 3 overlap');
rollback to mixed_overlap;
select pg_temp.check_v3(public.finance_disable_parser_template_v2((select id from selected_v3)),'operator can disable algorithm 3');
select pg_temp.check_v3(public.finance_requeue_parser_template_v2((select id from selected_v3)),'operator can requeue algorithm 3');
select pg_temp.check_v3(not public.finance_promote_parser_template_v2((select id from selected_v3)),'requeue resets fresh-shadow gate');
select pg_temp.v3_fixture(1,n,(select id from selected_v3)) from generate_series(7,9) n;
select pg_temp.check_v3(public.finance_promote_parser_template_v2((select id from selected_v3)),'fresh observations after requeue qualify');

-- Every eligible reviewed case is replayed, not only supporting corrections.
select pg_temp.v3_fixture(1,10,null,'missing');
select pg_temp.v3_fixture(1,11,null,'null');
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3((select outcome='unresolved_missing_context' from public.finance_template_evidence
 where template_id=(select id from selected_v3) and candidate_id=md5('v3-candidate-1-10')::uuid),'missing baseline is not reconstructed');
select pg_temp.check_v3((select outcome='not_applicable' from public.finance_template_evidence
 where template_id=(select id from selected_v3) and candidate_id=md5('v3-candidate-1-11')::uuid),'explicit null baseline is non-applicable');
update public.finance_transactions set reference_number='DIFFERENT' where id=md5('v3-tx-1-1')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3((select status='disabled' and contradiction_count=1 from public.finance_parser_templates where id=(select id from selected_v3)),'contradiction atomically disables active template');

-- Latest corrections, cutoff and accepted status govern generation.
select pg_temp.v3_fixture(7,n,null,'recorded',true,'2026-08-31T23:59:59Z') from generate_series(1,3) n;
select pg_temp.v3_fixture(8,n) from generate_series(1,3) n;
insert into public.finance_corrections(user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value,created_at)
values('d3000000-0000-4000-8000-000000000001',md5('v3-tx-8-1')::uuid,md5('v3-intake-8-1')::uuid,'reference_number','"AB-1"','null',clock_timestamp());
-- Repeated corrections for one transaction cannot stand in for a third supporter.
insert into public.finance_corrections(user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value,created_at)
select user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value,clock_timestamp()
 from public.finance_corrections where transaction_id=md5('v3-tx-8-2')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_templates where algorithm_version=3
 and scope_source_id in (md5('v3-source-7')::uuid,md5('v3-source-8')::uuid)),'pre-cutoff and superseded corrections do not generate');
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_candidate_configs_v3('reference_number','','AB-1','[]',
 '{"reference_number":"TX2026AB-1"}') cfg where cfg->>'type'='strip_prefix'),'numeric affixes never persisted');
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_candidate_configs_v3('amount','RM 12.50','12.50','[]','{}')),'amount learning deferred');

select pg_temp.v3_fixture(1,12);
update public.finance_candidate_transactions set payload='{"parser_template_baseline":{"reference_number":"OCR-"}}' where id=md5('v3-candidate-1-12')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3((select outcome='invalid_output' from public.finance_template_evidence where template_id=(select id from selected_v3)
 and candidate_id=md5('v3-candidate-1-12')::uuid),'invalid transformations are retained in evidence');

create temporary table evidence_before_reset as select * from public.finance_template_evidence;
select public.finance_set_parser_learning_cutoff('d3000000-0000-4000-8000-000000000001',clock_timestamp());
select pg_temp.check_v3(not exists(select 1 from public.finance_parser_templates where algorithm_version=3 and status in ('active','shadow')),'cutoff retires algorithm 3');
select pg_temp.check_v3(not public.finance_requeue_parser_template_v2((select id from selected_v3)),'retired period cannot requeue');
select pg_temp.check_v3(not exists(select * from evidence_before_reset except select * from public.finance_template_evidence),'cutoff retains prior evidence');

-- Explicit privileges, unchanged cron, retention and atomic failure.

-- Combined-version capacity and ownership cannot be bypassed with a version switch.
savepoint combined_capacity;
insert into auth.users(id) values('d4000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name)
select md5('v3-cap-source-'||n)::uuid,'d4000000-0000-4000-8000-000000000001','Capacity Source '||n from generate_series(1,51) n;
do $capacity$
declare n int; t uuid; cfg jsonb; alg int;
begin
 for n in 1..1000 loop
  alg:=case when n%2=0 then 2 else 3 end;
  cfg:=case when alg=2 then '{"type":"same_line_label","label":"Notes"}'::jsonb
   else '{"type":"bounded_line_window","anchor":"Notes","direction":"after","max_lines":1}'::jsonb end;
  insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
  values('d4000000-0000-4000-8000-000000000001','cap-'||n,md5('v3-cap-source-'||((n-1)/20+1))::uuid,'notes',cfg->>'type',cfg,alg,1) returning id into t;
  update public.finance_parser_templates set status='shadow' where id=t;
 end loop;
 insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
 values('d4000000-0000-4000-8000-000000000001','overflow',md5('v3-cap-source-51')::uuid,'notes','bounded_line_window',
  '{"type":"bounded_line_window","anchor":"Notes","direction":"after","max_lines":1}',3,1) returning id into t;
 begin
  update public.finance_parser_templates set status='shadow' where id=t;
  raise exception 'FAILED: mixed-version user cap accepted 1001';
 exception when check_violation then null; end;
 -- Free a different scope, retaining the full 20-template first scope.
 update public.finance_parser_templates set status='rejected',status_reason='insufficient_evidence' where template_key='cap-1000';
 insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
 values('d4000000-0000-4000-8000-000000000001','scope-overflow',md5('v3-cap-source-1')::uuid,'notes','bounded_line_window',
  '{"type":"bounded_line_window","anchor":"Notes","direction":"after","max_lines":1}',3,1) returning id into t;
 begin
  update public.finance_parser_templates set status='shadow' where id=t;
  raise exception 'FAILED: mixed-version scope cap accepted 21';
 exception when check_violation then null; end;
 begin
  insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
  values('d4000000-0000-4000-8000-000000000001','foreign',md5('v3-source-1')::uuid,'reference_number','strip_prefix','{"type":"strip_prefix","value":"OCR-"}',3,1);
  set constraints finance_parser_templates_scope_source_user_fkey immediate;
  raise exception 'FAILED: foreign source accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
  values('d4000000-0000-4000-8000-000000000001','amount',md5('v3-cap-source-1')::uuid,'amount','numeric_separator',
   '{"type":"numeric_separator","decimal_separator":".","grouping_separator":","}',3,1);
  raise exception 'FAILED: algorithm 3 amount accepted';
 exception when check_violation then null; end;
end;
$capacity$;
rollback to combined_capacity;
select pg_temp.check_v3(not exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
 where ns.nspname='public' and p.proname in ('finance_evaluate_parser_template_v3','finance_parser_candidate_configs_v3','finance_refresh_parser_templates_v3')
 and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),'new helpers operator-only');
select pg_temp.check_v3((select schedule='15 3 * * *' and command='SET statement_timeout = ''90s''; SELECT public.finance_refresh_rule_suggestions();'
 from cron.job where jobname='finance-rule-learning'),'cron and timeout unchanged');
insert into public.finance_learning_runs(invocation_id,status,started_at,finished_at)
values('d3000000-0000-4000-8000-000000000090','succeeded',clock_timestamp()-interval '92 days',clock_timestamp()-interval '91 days');
select public.finance_refresh_rule_suggestions();
select pg_temp.check_v3(not exists(select 1 from public.finance_learning_runs where invocation_id='d3000000-0000-4000-8000-000000000090'),'90-day retention');
create temporary table failure_before as select * from public.finance_parser_templates;
create or replace function public.finance_refresh_parser_templates_v3(p_run_id uuid) returns jsonb language plpgsql as $f$
begin raise exception 'synthetic private failure'; end;
$f$;
select public.finance_refresh_rule_suggestions('d3000000-0000-4000-8000-000000000099');
select pg_temp.check_v3((select status='failed' and failure_code='learning_refresh_failed' from public.finance_learning_runs
 where invocation_id='d3000000-0000-4000-8000-000000000099'),'algorithm 3 failure recorded safely');
select pg_temp.check_v3(not exists(select * from public.finance_parser_templates except select * from failure_before),'failed transaction leaves templates unchanged');
rollback;
