-- Isolated database only. All fixtures and operator changes roll back.
begin;
create function pg_temp.check_cutoff(ok boolean, label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $f$;
insert into auth.users(id) values('c1000000-0000-4000-8000-000000000001'),('c2000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name) values
 ('c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','Cutoff Bank'),
 ('c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','Other Bank');
create function pg_temp.cutoff_fixture(n integer, uploaded timestamptz, other_user boolean default false, label text default 'Order ID', observed_template uuid default null) returns void
language plpgsql as $f$
declare
 owner_id uuid:=case when other_user then 'c2000000-0000-4000-8000-000000000001'::uuid else 'c1000000-0000-4000-8000-000000000001'::uuid end;
 source_id uuid:=case when other_user then 'c2000000-0000-4000-8000-000000000002'::uuid else 'c1000000-0000-4000-8000-000000000002'::uuid end;
 intake uuid:=md5('cutoff-intake-'||n)::uuid; tx uuid:=md5('cutoff-tx-'||n)::uuid; trace jsonb:='{}'; version integer;
begin
 if observed_template is not null then
  select template_version into version from public.finance_parser_templates where id=observed_template;
  trace:=jsonb_build_object('parser_template_evaluations',jsonb_build_array(jsonb_build_object(
   'template_id',observed_template,'algorithm_version',2,'template_version',version,'status','shadow','outcome','shadow',
   'value_hash',public.finance_template_value_hash_v2('reference_number','SYN-'||n))));
 end if;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,ocr_normalized_text,original_filename)
 values(intake,owner_id,'screenshot','completed',uploaded,label||': SYN-'||n,'capture.png');
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id)
 values(tx,owner_id,source_id,'confirmed','expense',12.5,'2026-07-15','screenshot','SYN-'||n,intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,created_at,payload)
 values(md5('cutoff-candidate-'||n)::uuid,owner_id,tx,intake,'accepted',clock_timestamp(),trace);
 insert into public.finance_corrections(id,user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value)
 values(gen_random_uuid(),owner_id,tx,intake,'reference_number','"WRONG"',to_jsonb('SYN-'||n));
end;
$f$;
select pg_temp.cutoff_fixture(n,'2026-09-05T15:59:59.999999Z') from generate_series(1,3) n;
select pg_temp.cutoff_fixture(n,'2026-09-04T00:00Z',false,'invoice number') from generate_series(21,23) n;
select pg_temp.cutoff_fixture(n,'2026-09-04T00:00Z',true) from generate_series(31,33) n;
select public.finance_refresh_rule_suggestions();
create temporary table original_template as select id from public.finance_parser_templates
 where user_id='c1000000-0000-4000-8000-000000000001' and configuration->>'label'='order id';
select pg_temp.cutoff_fixture(n,'2026-09-05T16:00:00Z',false,'Order ID',(select id from original_template)) from generate_series(4,6) n;
select pg_temp.check_cutoff(public.finance_promote_parser_template_v2((select id from original_template)),'pre-cutoff template can activate');
-- This old upload is corrected today, but must never poison the new period.
update public.finance_transactions set reference_number='DIFFERENT' where id=md5('cutoff-tx-1')::uuid;
create temporary table old_evidence as select e.* from public.finance_template_evidence e;
create temporary table other_templates as select t.* from public.finance_parser_templates t where user_id='c2000000-0000-4000-8000-000000000001';
create temporary table history_before as
 select 'transactions' kind,to_jsonb(t) value from public.finance_transactions t
 union all select 'candidates',to_jsonb(c) from public.finance_candidate_transactions c
 union all select 'intakes',to_jsonb(i) from public.finance_intake_items i
 union all select 'corrections',to_jsonb(c) from public.finance_corrections c
 union all select 'legacy_rules',to_jsonb(r) from public.finance_rules r
 union all select 'legacy_fields',to_jsonb(r) from public.finance_field_learning_rules r;
select pg_temp.check_cutoff(public.finance_set_parser_learning_cutoff('c1000000-0000-4000-8000-000000000001','2026-09-06 00:00:00 Asia/Kuala_Lumpur'),'cutoff changes');
select pg_temp.check_cutoff((select status='disabled' and status_reason='learning_cutoff_changed' from public.finance_parser_templates where id=(select id from original_template)),'old active template retired');
select pg_temp.check_cutoff((select status='rejected' from public.finance_parser_templates where user_id='c1000000-0000-4000-8000-000000000001' and configuration->>'label'='invoice number'),'old shadow template retired');
select pg_temp.check_cutoff(not public.finance_set_parser_learning_cutoff('c1000000-0000-4000-8000-000000000001','2026-09-05T16:00:00Z'),'same cutoff is idempotent');
-- The wrapper must still invoke legacy learning. Stub only the test transaction.
create temporary table legacy_calls(n integer);
create or replace function public.finance_refresh_rule_suggestions_legacy_v1() returns integer language plpgsql as $f$
begin insert into pg_temp.legacy_calls values(1); return 0; end;
$f$;
select public.finance_refresh_rule_suggestions('c1000000-0000-4000-8000-000000000009');
select pg_temp.check_cutoff((select count(*)=1 from legacy_calls),'legacy learner is still called');
select pg_temp.check_cutoff((select status='succeeded' and candidates_evaluated=6 from public.finance_learning_runs where invocation_id='c1000000-0000-4000-8000-000000000009'),'run counts current-period evidence plus unaffected user');
create temporary table fresh_template as select id from public.finance_parser_templates
 where user_id='c1000000-0000-4000-8000-000000000001' and learning_cutoff_at='2026-09-05T16:00:00Z';
select pg_temp.check_cutoff((select count(*)=1 from fresh_template),'old-only configuration is not regenerated');
select pg_temp.check_cutoff((select template_version=2 and predecessor_template_id=(select id from original_template)
 and status='shadow' and evidence_count=3 and contradiction_count=0 from public.finance_parser_templates where id=(select id from fresh_template)),
 'midnight uploads qualify despite old transaction dates; old contradiction is excluded');
select pg_temp.check_cutoff(not public.finance_promote_parser_template_v2((select id from fresh_template)),'old template traces cannot promote new version');
select pg_temp.check_cutoff(not public.finance_requeue_parser_template_v2((select id from original_template)),'retired version cannot requeue');
select pg_temp.check_cutoff(not exists(select * from old_evidence except select * from public.finance_template_evidence),'old evidence preserved');
select pg_temp.check_cutoff(not exists(select * from other_templates except select * from public.finance_parser_templates),'other user unchanged');
select pg_temp.check_cutoff(not exists(select * from history_before except (
 select 'transactions',to_jsonb(t) from public.finance_transactions t
 union all select 'candidates',to_jsonb(c) from public.finance_candidate_transactions c
 union all select 'intakes',to_jsonb(i) from public.finance_intake_items i
 union all select 'corrections',to_jsonb(c) from public.finance_corrections c
 union all select 'legacy_rules',to_jsonb(r) from public.finance_rules r
 union all select 'legacy_fields',to_jsonb(r) from public.finance_field_learning_rules r)),'reset preserves finance history and legacy rules');
select pg_temp.cutoff_fixture(n,'2026-09-06T00:00:00Z',false,'Order ID',(select id from fresh_template)) from generate_series(7,9) n;
select pg_temp.check_cutoff(public.finance_promote_parser_template_v2((select id from fresh_template)),'fresh reviewed shadow cases can activate');
do $guards$
begin
 begin
  perform public.finance_set_parser_learning_cutoff('c1000000-0000-4000-8000-000000000001','2026-09-04T00:00Z');
  raise exception 'FAILED: backward cutoff accepted';
 exception when invalid_parameter_value then null; end;
 begin
  update public.finance_parser_templates set learning_cutoff_at='-infinity' where id=(select id from fresh_template);
  raise exception 'FAILED: mutable template period';
 exception when check_violation then null; end;
end;
$guards$;
select pg_temp.check_cutoff(not has_function_privilege('service_role','public.finance_set_parser_learning_cutoff(uuid,timestamptz)','execute'),'service role cannot reset learning');
select pg_temp.check_cutoff(not has_table_privilege('authenticated','finance_private.finance_parser_learning_settings','select'),'settings are private');
rollback;
