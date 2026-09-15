-- Run only on a disposable database at the calendar-start migration.
-- This test applies the forward migration and removes its synthetic user afterward.
\set ON_ERROR_STOP on
create function pg_temp.check_settings(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$$;
insert into auth.users(id) values('b0150000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0150000-0000-4000-8000-000000000011','b0150000-0000-4000-8000-000000000001','Original bank'),
 ('b0150000-0000-4000-8000-000000000012','b0150000-0000-4000-8000-000000000001','Deleted bank');
create temporary table migration_budgets(id uuid,configuration jsonb,revision integer);
create temporary table migration_cycles(id uuid,result jsonb);
do $$
declare u uuid:='b0150000-0000-4000-8000-000000000001'; active_id uuid; archived_id uuid; config jsonb;
begin
 config:='{"name":"Migration active","amount":"100.00","cycle_type":"weekly","start_date":"2026-09-07","custom_days":null,"anchor_day":null,"time_zone":"Asia/Kuala_Lumpur","filter_logic":"and","include_uncategorised":false,"source_ids":["b0150000-0000-4000-8000-000000000011"],"category_ids":[]}';
 active_id:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-07T04:00Z');
 insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date)
 values(u,'b0150000-0000-4000-8000-000000000011','expense',25,'2026-09-08');
 perform public.finance_budget_reconcile(u,active_id,'2026-09-14T04:00Z');
 perform public.finance_budget_mutate(u,'update',active_id,1,null,config||'{"amount":"250.00","source_ids":[]}', '2026-09-14T04:00Z');
 config:=config||'{"name":"Migration archived","source_ids":["b0150000-0000-4000-8000-000000000012"]}';
 archived_id:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-07T04:00Z');
 perform public.finance_budget_mutate(u,'archive',archived_id,1,null,null,'2026-09-08T04:00Z');
 perform public.finance_delete_source(u,'b0150000-0000-4000-8000-000000000012');
 perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Migration scheduled","start_date":"2026-10-05","source_ids":[]}', '2026-09-14T04:00Z');
 insert into migration_budgets select id,(public.finance_budget_summary(u,id,'2026-09-14T04:00Z')->'version')-array['id','effective_date'],revision
 from public.finance_budgets where user_id=u;
 insert into migration_cycles select id,public.finance_budget_cycle_json(u,id,'2026-09-14')
 from public.finance_budget_cycles where user_id=u and frozen_at is not null;
end;
$$;

\ir ../migrations/20260915095835_finance_budget_current_settings.sql

select pg_temp.check_settings(to_regclass('public.finance_budget_versions') is null
 and to_regclass('public.finance_budget_version_sources') is null
 and to_regclass('public.finance_budget_version_categories') is null,'version tables removed');
select pg_temp.check_settings(not exists(select 1 from migration_budgets old join public.finance_budgets b on b.id=old.id
 where b.revision<>old.revision or public.finance_budget_configuration(b.user_id,b.id)<>old.configuration),'current settings and missing selections preserved');
select pg_temp.check_settings(not exists(select 1 from migration_cycles old join public.finance_budget_cycles c on c.id=old.id
 where public.finance_budget_cycle_json(c.user_id,c.id,'2026-09-14')-'configuration'<>old.result),'all frozen results preserved');
select pg_temp.check_settings(exists(select 1 from public.finance_budget_cycles
 where user_id='b0150000-0000-4000-8000-000000000001' and configuration_snapshot->>'amount'='100.00'), 'historic amount is independent of current 250 limit');
select pg_temp.check_settings(public.finance_budget_close_due('2026-09-21T04:00Z')>=1,'closure works after migration');
delete from auth.users where id='b0150000-0000-4000-8000-000000000001';
