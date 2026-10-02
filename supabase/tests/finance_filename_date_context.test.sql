-- Isolated migrated database only. All fixtures and operator actions roll back.
begin;
create function pg_temp.check_date(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$f$;
insert into auth.users(id) values('d4000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name)
values('d4000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','Synthetic bank');
select public.finance_set_parser_learning_cutoff('d4000000-0000-4000-8000-000000000001','2026-09-01T00:00Z');

create function pg_temp.date_fixture(n int,filename text default 'Screenshot_20260924_120000.png',observed uuid default null,
 accepted boolean default true,uploaded timestamptz default clock_timestamp(),ocr text default 'Today, 12:48 PM')
returns void language plpgsql as $f$
declare intake uuid:=md5('date-intake-'||n)::uuid; tx uuid:=md5('date-tx-'||n)::uuid; payload jsonb:='{}';
begin
 if observed is not null then
  payload:=jsonb_build_object('parser_template_evaluations',jsonb_build_array(jsonb_build_object(
   'template_id',observed,'algorithm_version',4,'template_version',1,'status','shadow',
   'outcome',case when filename is null then 'unresolved_missing_context' else 'shadow' end,
   'value_hash',case when filename is not null then public.finance_template_value_hash_v2('transaction_date','2026-09-24') end)));
 end if;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,ocr_normalized_text,original_filename)
 values(intake,'d4000000-0000-4000-8000-000000000001','screenshot','completed',uploaded,ocr,filename);
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,intake_item_id)
 values(tx,'d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002','confirmed','expense',12.5,'2026-09-24','screenshot',intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,payload,created_at)
 values(md5('date-candidate-'||n)::uuid,'d4000000-0000-4000-8000-000000000001',tx,intake,case when accepted then 'accepted' else 'pending' end,payload,clock_timestamp());
 insert into public.finance_corrections(user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value)
 values('d4000000-0000-4000-8000-000000000001',tx,intake,'transaction_date','null','"2026-09-24"');
end;
$f$;
select pg_temp.date_fixture(n) from generate_series(1,2) n;
select pg_temp.date_fixture(3,'Screenshot_20260924_120000.png',null,false);
select pg_temp.date_fixture(4,'Screenshot_20260924_120000.png',null,true,'2026-08-31T00:00Z');
select public.finance_refresh_rule_suggestions();
select pg_temp.check_date(not exists(select 1 from public.finance_parser_templates where algorithm_version=4),'pending and old uploads cannot supply third support');
update public.finance_candidate_transactions set status='accepted' where id=md5('date-candidate-3')::uuid;
select pg_temp.date_fixture(5,null);
select pg_temp.date_fixture(6,'synthetic.png');
select pg_temp.date_fixture(7,null,null,true,clock_timestamp(),'Yesterday');
select public.finance_refresh_rule_suggestions('d4000000-0000-4000-8000-000000000003');
select pg_temp.check_date((select status='succeeded' and algorithm_version=4 from public.finance_learning_runs where invocation_id='d4000000-0000-4000-8000-000000000003'),'integrated refresh succeeds');
create temporary table selected_date as select id from public.finance_parser_templates where algorithm_version=4;
select pg_temp.check_date((select count(*)=1 from selected_date),'one bounded date definition generated');
select pg_temp.check_date((select status='shadow' and evidence_count=3 and evaluation_count=3 and contradiction_count=0 and precision=1 and coverage=0.5
 from public.finance_parser_templates where id=(select id from selected_date)),'missing context excluded from precision but retained in coverage');
select pg_temp.check_date((select count(*)=2 from public.finance_template_evidence where template_id=(select id from selected_date) and outcome='unresolved_missing_context' and value_hash is null),'two abstentions without value hashes');
select pg_temp.check_date((select count(*)=3 from public.finance_template_evidence where template_id=(select id from selected_date) and outcome='supported' and value_hash is not null and template_version=1),'versioned successful evidence');
select pg_temp.check_date((select status='rejected' and contradiction_count=2 from public.finance_parser_templates where algorithm_version=2 and template_type='filename_date'),'algorithm 2 retains old invalid-output semantics');
savepoint capacity;
insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,learning_cutoff_at)
select 'd4000000-0000-4000-8000-000000000001','capacity-'||n,'d4000000-0000-4000-8000-000000000002',
 'transaction_date','date_format','{"type":"date_format","input_format":"dd/mm/yyyy"}',3,1,'2026-09-01T00:00Z'
from generate_series(1,19) n;
update public.finance_parser_templates set status='shadow' where template_key like 'capacity-%';
do $capacity$
declare blocked boolean:=false;
begin
 begin
  update public.finance_parser_templates set status='proposed' where algorithm_version=2 and template_type='filename_date';
  update public.finance_parser_templates set status='shadow' where algorithm_version=2 and template_type='filename_date';
 exception when check_violation then blocked:=true;
 end;
 perform pg_temp.check_date(blocked,'algorithm 4 participates in the combined twenty-rule limit');
end;
$capacity$;
rollback to capacity;
create temporary table before_dates as select * from public.finance_parser_templates;
create temporary table before_date_evidence as select * from public.finance_template_evidence;
select public.finance_refresh_rule_suggestions('d4000000-0000-4000-8000-000000000003');
select pg_temp.check_date(not exists(select * from public.finance_parser_templates except select * from before_dates),'invocation retry preserves templates');
select pg_temp.check_date(not exists(select * from public.finance_template_evidence except select * from before_date_evidence),'invocation retry preserves evidence');
select pg_temp.check_date(not public.finance_promote_parser_template_v2((select id from selected_date)),'history cannot activate');
select pg_temp.date_fixture(8,null,(select id from selected_date));
select pg_temp.date_fixture(n,'Screenshot_20260924_120000.png',(select id from selected_date)) from generate_series(9,10) n;
select pg_temp.check_date(not public.finance_promote_parser_template_v2((select id from selected_date)),'abstention is not third fresh support');
select pg_temp.date_fixture(11,'Screenshot_20260924_120000.png',(select id from selected_date));
select pg_temp.check_date(public.finance_promote_parser_template_v2((select id from selected_date)),'three fresh successful reviews permit operator promotion');

savepoint malformed_date;
select pg_temp.date_fixture(12,'Screenshot_20260230_120000.png');
select public.finance_refresh_rule_suggestions();
select pg_temp.check_date((select status='disabled' and contradiction_count=1 from public.finance_parser_templates where id=(select id from selected_date)),'impossible date still disables');
rollback to malformed_date;
select pg_temp.check_date(public.finance_disable_parser_template_v2((select id from selected_date)),'operator disable supports algorithm 4');
select pg_temp.check_date(public.finance_requeue_parser_template_v2((select id from selected_date)),'operator requeue supports algorithm 4');
select pg_temp.check_date(not public.finance_promote_parser_template_v2((select id from selected_date)),'requeue resets shadow window');
select pg_temp.date_fixture(n,'Screenshot_20260924_120000.png',(select id from selected_date)) from generate_series(12,14) n;
select pg_temp.check_date(public.finance_promote_parser_template_v2((select id from selected_date)),'fresh reviews after requeue qualify');
update public.finance_transactions set transaction_date='2026-09-23' where id=md5('date-tx-1')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_date((select status='disabled' and contradiction_count=1 from public.finance_parser_templates where id=(select id from selected_date)),'real reviewed disagreement still disables');
select public.finance_set_parser_learning_cutoff('d4000000-0000-4000-8000-000000000001',clock_timestamp());
select pg_temp.check_date(not public.finance_requeue_parser_template_v2((select id from selected_date)),'old learning period cannot requeue');
select pg_temp.check_date(not has_function_privilege('service_role','public.finance_refresh_parser_templates_v4(uuid)','execute')
 and not has_function_privilege('authenticated','public.finance_evaluate_parser_template_v4(text,jsonb,text,text)','execute')
 and not has_function_privilege('anon','public.finance_parser_filename_configs_v4(text,text,text,text)','execute'),'new helpers are operator only');
rollback;
