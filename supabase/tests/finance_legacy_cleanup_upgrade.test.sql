-- Isolated retired predecessor only. The exact cleanup migration and fixtures roll back.
begin;
create function pg_temp.check_cleanup(ok boolean, label text) returns void language plpgsql as $f$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
end;
$f$;

insert into auth.users(id) values ('ec100000-0000-4000-8000-000000000001');
insert into public.dim_modules(id,modules,name,path,enabled,is_always_allowed)
values ('ec100000-0000-4000-8000-000000000010','finance','Finance','/finance',true,true)
on conflict(modules) do update set enabled=true,is_always_allowed=true;
insert into public.dim_finance_sources(id,user_id,name) values
 ('ec100000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','Preserved Bank'),
 ('ec100000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000001','Unused Bank');
insert into public.dim_finance_categories(id,user_id,name) values
 ('ec100000-0000-4000-8000-000000000004','ec100000-0000-4000-8000-000000000001','Preserved Category'),
 ('ec100000-0000-4000-8000-000000000005','ec100000-0000-4000-8000-000000000001','Unused Category');
insert into public.finance_transactions(id,user_id,source_id,category_id,status,direction,amount,transaction_date,source)
values ('ec100000-0000-4000-8000-000000000006','ec100000-0000-4000-8000-000000000001',
 'ec100000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000004',
 'confirmed','expense',12,'2026-10-08','manual');
insert into public.finance_corrections(user_id,transaction_id,field_name,previous_value,corrected_value)
values ('ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000006','reference_number','"OCR-123"','"123"');
insert into public.finance_learning_runs(id,invocation_id,status,finished_at,legacy_inserted_count,legacy_rules_created)
values ('ec100000-0000-4000-8000-000000000007','ec100000-0000-4000-8000-000000000008','succeeded',clock_timestamp(),7,7);
insert into public.finance_learning_run_user_summaries(run_id,user_id,reference_rules_created)
values ('ec100000-0000-4000-8000-000000000007','ec100000-0000-4000-8000-000000000001',7);
insert into public.finance_rules(id,user_id,name,match_type,pattern,source,direction)
values ('ec100000-0000-4000-8000-000000000009','ec100000-0000-4000-8000-000000000001','Manual rule','keyword','synthetic','manual','expense');

create temporary table preserved as
 select 'transaction' kind,to_jsonb(t) value from public.finance_transactions t
 union all select 'correction',to_jsonb(c) from public.finance_corrections c
 union all select 'candidate',to_jsonb(c) from public.finance_candidate_transactions c
 union all select 'intake',to_jsonb(i) from public.finance_intake_items i
 union all select 'run',to_jsonb(r) from public.finance_learning_runs r
 union all select 'summary',to_jsonb(s) from public.finance_learning_run_user_summaries s
 union all select 'template',to_jsonb(t) from public.finance_parser_templates t
 union all select 'evidence',to_jsonb(e) from public.finance_template_evidence e;
create temporary table function_access as
 select p.oid,p.proacl,p.proowner,p.prosecdef,p.proconfig
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('finance_learning_summary_v1','finance_delete_source','finance_delete_category'))
    or (n.nspname='finance_private' and p.proname='finance_guard_retired_learning');

\ir ../migrations/20261008025952_remove_legacy_finance_learning_tables.sql

select pg_temp.check_cleanup(to_regclass('public.finance_rule_suggestions') is null
 and to_regclass('public.finance_field_learning_rules') is null,'both legacy tables removed');
select pg_temp.check_cleanup(to_regprocedure('public.finance_accept_rule_suggestion(uuid,uuid)') is null
 and to_regprocedure('public.finance_refresh_rule_suggestions_phase_one_v1(uuid)') is null
 and to_regprocedure('public.finance_refresh_rule_suggestions_phase_two_v1(uuid)') is null
 and to_regprocedure('public.finance_refresh_rule_suggestions_legacy_v1()') is null,'obsolete RPCs removed without stubs');
select pg_temp.check_cleanup(not exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','finance_private')
 and p.prosrc ~ 'finance_rule_suggestions|finance_field_learning_rules|finance_accept_rule_suggestion|finance_refresh_rule_suggestions_(phase_one_v1|phase_two_v1|legacy_v1)'
),'no database callers remain');
select pg_temp.check_cleanup(not exists (
 select * from function_access except
 select p.oid,p.proacl,p.proowner,p.prosecdef,p.proconfig from pg_proc p
),'retained functions keep permissions, owner and search path');
select pg_temp.check_cleanup(not exists(select * from preserved except (
 select 'transaction',to_jsonb(t) from public.finance_transactions t
 union all select 'correction',to_jsonb(c) from public.finance_corrections c
 union all select 'candidate',to_jsonb(c) from public.finance_candidate_transactions c
 union all select 'intake',to_jsonb(i) from public.finance_intake_items i
 union all select 'run',to_jsonb(r) from public.finance_learning_runs r
 union all select 'summary',to_jsonb(s) from public.finance_learning_run_user_summaries s
 union all select 'template',to_jsonb(t) from public.finance_parser_templates t
 union all select 'evidence',to_jsonb(e) from public.finance_template_evidence e
)),'current data and historical learning metrics preserved');

set local role service_role;
select pg_temp.check_cleanup(
 public.finance_learning_summary_v1('ec100000-0000-4000-8000-000000000001')->>'availability'='available'
 and public.finance_learning_summary_v1('ec100000-0000-4000-8000-000000000001')->>'active_reference_rules'='0'
 and public.finance_learning_summary_v1('ec100000-0000-4000-8000-000000000001')->'latest_run'->>'reference_rules_created'='7',
 'summary works without removed table and retains historical counts');
select pg_temp.check_cleanup(public.finance_delete_source('ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000003'),'unused source deletion works');
select pg_temp.check_cleanup(public.finance_delete_category('ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000005'),'unused category deletion works');
do $guards$
begin
  begin
    perform public.finance_delete_source('ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000002');
    raise exception 'FAILED: deleted referenced source';
  exception when foreign_key_violation then null; end;
  begin
    perform public.finance_delete_category('ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000004');
    raise exception 'FAILED: deleted referenced category';
  exception when foreign_key_violation then null; end;
end;
$guards$;
reset role;
do $manual_rule_guard$
begin
  begin
    update public.finance_rules set source='learning' where id='ec100000-0000-4000-8000-000000000009';
    raise exception 'FAILED: converted manual rule to legacy learning';
  exception when check_violation then null; end;
end;
$manual_rule_guard$;
select pg_temp.check_cleanup((select is_active from public.finance_rules where id='ec100000-0000-4000-8000-000000000009'),'manual rule remains usable');
select public.finance_refresh_rule_suggestions('ec100000-0000-4000-8000-000000000011');
select pg_temp.check_cleanup((select status='succeeded' from public.finance_learning_runs
 where invocation_id='ec100000-0000-4000-8000-000000000011'),'current parser learning runs without obsolete RPCs');
rollback;
