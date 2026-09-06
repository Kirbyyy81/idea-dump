-- Run only against an isolated test database with the Finance migrations applied.
-- Every fixture and mutation is rolled back.
begin;
create function pg_temp.check_parser_test(ok boolean, label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $f$;
insert into auth.users(id) values('a1000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name)
values('a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Fixture Bank');
insert into public.dim_finance_payees(id,user_id,name,normalized_name)
values('a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','Alex Tan','alextan');
do $fixtures$
declare n int; intake uuid; tx uuid;
begin for n in 1..3 loop
 intake:=md5('phase45-intake-'||n)::uuid; tx:=md5('phase45-tx-'||n)::uuid;
 insert into public.finance_intake_items(id,user_id,source,status,ocr_normalized_text,original_filename)
 values(intake,'a1000000-0000-4000-8000-000000000001','screenshot','completed','Order ID: SYN-'||n,'capture.png');
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id)
 values(tx,'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','confirmed','expense',12.5,'2026-07-15','screenshot','SYN-'||n,intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,created_at)
 values(md5('phase45-candidate-'||n)::uuid,'a1000000-0000-4000-8000-000000000001',tx,intake,'accepted',clock_timestamp()-interval '1 day');
 insert into public.finance_corrections(id,user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value)
 values(gen_random_uuid(),'a1000000-0000-4000-8000-000000000001',tx,intake,'reference_number','"WRONG"',to_jsonb('SYN-'||n));
 end loop;
end;
$fixtures$;
select public.finance_refresh_rule_suggestions('a1000000-0000-4000-8000-000000000004');
select pg_temp.check_parser_test((select status='succeeded' from public.finance_learning_runs where invocation_id='a1000000-0000-4000-8000-000000000004'),'refresh succeeds');
select pg_temp.check_parser_test((select count(*)=1 from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number'),'one deterministic proposal');
select pg_temp.check_parser_test((select status='shadow' and evidence_count=3 from public.finance_parser_templates where algorithm_version=2),'historical support enters shadow');
select pg_temp.check_parser_test(not public.finance_promote_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'history alone cannot activate');
select public.finance_refresh_rule_suggestions('a1000000-0000-4000-8000-000000000004');
select pg_temp.check_parser_test((select count(*)=1 from public.finance_learning_runs where invocation_id='a1000000-0000-4000-8000-000000000004'),'invocation retry is idempotent');
do $shadow$
declare n int; intake uuid; tx uuid; template_id uuid;
begin
 select id into template_id from public.finance_parser_templates where algorithm_version=2;
 for n in 4..6 loop
 intake:=md5('phase45-intake-'||n)::uuid; tx:=md5('phase45-tx-'||n)::uuid;
 insert into public.finance_intake_items(id,user_id,source,status,ocr_normalized_text,original_filename)
 values(intake,'a1000000-0000-4000-8000-000000000001','screenshot','completed','Order ID: SYN-'||n,'capture.png');
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id)
 values(tx,'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','confirmed','expense',12.5,'2026-07-15','screenshot','SYN-'||n,intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,created_at,payload)
 values(md5('phase45-candidate-'||n)::uuid,'a1000000-0000-4000-8000-000000000001',tx,intake,'accepted',clock_timestamp(),
 jsonb_build_object('parser_template_evaluations',jsonb_build_array(jsonb_build_object(
 'template_id',template_id,'algorithm_version',2,'template_version',1,'status','shadow','outcome','shadow',
 'value_hash',public.finance_template_value_hash_v2('reference_number','SYN-'||n)))));
 end loop;
end;
$shadow$;
create temporary table parser_history_before as
select 'transactions' kind,to_jsonb(t) value from public.finance_transactions t
union all select 'candidates',to_jsonb(c) from public.finance_candidate_transactions c
union all select 'intakes',to_jsonb(i) from public.finance_intake_items i
union all select 'corrections',to_jsonb(c) from public.finance_corrections c;
select pg_temp.check_parser_test(public.finance_promote_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'three fresh reviewed shadow cases activate');

select pg_temp.check_parser_test(not exists(
 (select * from parser_history_before except
  (select 'transactions',to_jsonb(t) from public.finance_transactions t
   union all select 'candidates',to_jsonb(c) from public.finance_candidate_transactions c
   union all select 'intakes',to_jsonb(i) from public.finance_intake_items i
   union all select 'corrections',to_jsonb(c) from public.finance_corrections c))
),'replay and promotion preserve historical Finance records');
savepoint operator_rollback;
select pg_temp.check_parser_test(public.finance_disable_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'operator disable succeeds');
select pg_temp.check_parser_test((select status='disabled' and status_reason='operator_disabled' from public.finance_parser_templates where algorithm_version=2),'operator disable preserves definition');
select pg_temp.check_parser_test((select templates_disabled=1 from public.finance_learning_runs order by started_at desc limit 1),'operator disable is audited');
select pg_temp.check_parser_test(public.finance_requeue_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'operator rollback returns to shadow');
select pg_temp.check_parser_test(not public.finance_promote_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'operator rollback requires fresh observations');
rollback to savepoint operator_rollback;
update public.finance_transactions set reference_number='CORRECTED' where id=md5('phase45-tx-4')::uuid;
select public.finance_refresh_rule_suggestions('a1000000-0000-4000-8000-000000000005');
select pg_temp.check_parser_test((select status='disabled' and contradiction_count=1 from public.finance_parser_templates where algorithm_version=2),'contradiction disables atomically');
select pg_temp.check_parser_test((select status='succeeded' from public.finance_learning_runs where invocation_id='a1000000-0000-4000-8000-000000000005'),'disable refresh commits');
update public.finance_transactions set reference_number='SYN-4' where id=md5('phase45-tx-4')::uuid;
select pg_temp.check_parser_test(public.finance_requeue_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'rollback candidate reenters shadow after reevaluation');
select pg_temp.check_parser_test(not public.finance_promote_parser_template_v2((select id from public.finance_parser_templates where algorithm_version=2)),'old shadow evidence cannot reactivate rollback');
update public.dim_finance_sources set is_archived=true where id='a1000000-0000-4000-8000-000000000002';
select public.finance_refresh_rule_suggestions('a1000000-0000-4000-8000-000000000006');
select pg_temp.check_parser_test((select status='rejected' and status_reason='source_archived' from public.finance_parser_templates where algorithm_version=2),'archived source rejects shadow');

select pg_temp.check_parser_test(public.finance_template_value_v2('transaction_date','15 Jul 2026')='2026-07-15','named dates');
select pg_temp.check_parser_test(public.finance_template_value_v2('transaction_date','15/07/2026 10:00')='2026-07-15','date with time');
select pg_temp.check_parser_test(public.finance_template_value_v2('transaction_date','31/02/2026') is null,'impossible date');
select pg_temp.check_parser_test((select count(*)>0 from public.finance_parser_candidate_configs_v2('direction','You paid RM 12.50','expense','[]')),'direction generation');
select pg_temp.check_parser_test((select count(*)>0 from public.finance_parser_candidate_configs_v2('recipient_reference','Recipient Reference: Meal',E'Meal\nLunch','[]')),'recipient references learn from reviewed notes');
select pg_temp.check_parser_test(public.finance_evaluate_parser_template_v2('payee_name','{"type":"same_line_label","label":"Payee"}','Payee: Alex Tan',null,
 '[{"name":"Alex Tan","normalized_name":"alextan","is_archived":false}]')->>'value'='Alex Tan','canonical saved payee');
select pg_temp.check_parser_test(public.finance_evaluate_parser_template_v2('payee_name','{"type":"same_line_label","label":"Payee"}','Payee: Stranger',null,'[]')->>'outcome'='invalid_output','unknown payee rejected');
select pg_temp.check_parser_test(not has_function_privilege('service_role','public.finance_promote_parser_template_v2(uuid)','EXECUTE'),'service role cannot promote');
select pg_temp.check_parser_test(not has_function_privilege('authenticated','public.finance_refresh_parser_templates_v2(uuid)','EXECUTE'),'browser cannot refresh');

-- Failed and canceled refreshes retain a safe business outcome.
create or replace function public.finance_refresh_rule_suggestions_legacy_v1()
returns integer language plpgsql as $slow$
begin perform pg_sleep(0.5); return 0; end;
$slow$;
set local statement_timeout='50ms';
select public.finance_refresh_rule_suggestions('a1000000-0000-4000-8000-000000000007');
set local statement_timeout=0;
select pg_temp.check_parser_test((select status='failed' and failure_code='database_timeout'
 from public.finance_learning_runs where invocation_id='a1000000-0000-4000-8000-000000000007'),'actual statement timeout persists a safe failure');

insert into auth.users(id) values('a2000000-0000-4000-8000-000000000001');
do $ownership$
begin
 begin
  insert into public.finance_parser_templates(user_id,template_key,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version)
  values('a2000000-0000-4000-8000-000000000001','foreign-scope','a1000000-0000-4000-8000-000000000002','notes','same_line_label','{"type":"same_line_label","label":"Memo"}',2,1);
  set constraints finance_parser_templates_scope_source_user_fkey immediate;
  raise exception 'FAILED: cross-user source was accepted';
 exception when foreign_key_violation then null;
 end;
end;
$ownership$;

rollback;
