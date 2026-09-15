-- Run only on a disposable database through the current-settings migration.
\set ON_ERROR_STOP on
create function pg_temp.check_filters(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$$;
insert into auth.users(id) values('b0160000-0000-4000-8000-000000000001');
-- Matching UUIDs across dimensions must remain two distinct selections.
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0160000-0000-4000-8000-000000000011','b0160000-0000-4000-8000-000000000001','Bank'),
 ('b0160000-0000-4000-8000-000000000012','b0160000-0000-4000-8000-000000000001','Deleted bank');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0160000-0000-4000-8000-000000000011','b0160000-0000-4000-8000-000000000001','Food');
create temporary table filter_upgrade_before(id uuid,result jsonb);
do $$
declare u uuid:='b0160000-0000-4000-8000-000000000001'; b uuid; config jsonb;
begin
 config:='{"name":"Filter upgrade","amount":"100.00","cycle_type":"weekly","start_date":"2026-09-07","custom_days":null,"anchor_day":null,"time_zone":"Asia/Kuala_Lumpur","filter_logic":"and","include_uncategorised":false,"source_ids":["b0160000-0000-4000-8000-000000000011"],"category_ids":["b0160000-0000-4000-8000-000000000011"]}';
 b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-07T04:00Z');
 insert into public.finance_transactions(user_id,source_id,category_id,direction,amount,transaction_date)
 values(u,'b0160000-0000-4000-8000-000000000011','b0160000-0000-4000-8000-000000000011','expense',25,'2026-09-08');
 perform public.finance_budget_reconcile(u,b,'2026-09-14T04:00Z');
 perform public.finance_budget_mutate(u,'update',b,1,null,config||'{"amount":"250.00"}','2026-09-14T04:00Z');
 b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Missing selection","source_ids":["b0160000-0000-4000-8000-000000000012"],"category_ids":[]}', '2026-09-07T04:00Z');
 perform public.finance_budget_mutate(u,'archive',b,1,null,null,'2026-09-08T04:00Z');
 perform public.finance_delete_source(u,'b0160000-0000-4000-8000-000000000012');
 insert into filter_upgrade_before select id,public.finance_budget_cycle_json(u,id,'2026-09-14')-'breakdowns'
 from public.finance_budget_cycles where user_id=u;
 perform pg_temp.check_filters(exists(select 1 from public.finance_budget_cycle_breakdowns where user_id=u),'fixture includes real frozen breakdowns');
end;
$$;

\ir ../migrations/20260915165526_finance_budget_filters_and_cycle_totals.sql

select pg_temp.check_filters(to_regclass('public.finance_budget_sources') is null
 and to_regclass('public.finance_budget_categories') is null
 and to_regclass('public.finance_budget_cycle_breakdowns') is null,'obsolete tables removed');
select pg_temp.check_filters((select count(*)=3 from public.finance_budget_filters where user_id='b0160000-0000-4000-8000-000000000001'),'all selections copied');
select pg_temp.check_filters(not exists(select 1 from filter_upgrade_before old full join public.finance_budget_cycles c on c.id=old.id
 where c.user_id='b0160000-0000-4000-8000-000000000001' and (old.id is null or public.finance_budget_cycle_json(c.user_id,c.id,'2026-09-14')-'breakdowns' is distinct from old.result)), 'open and frozen cycle responses preserved apart from removed breakdowns');
do $$
declare u uuid:='b0160000-0000-4000-8000-000000000001'; b uuid; config jsonb;
begin
 select id into b from public.finance_budgets where user_id=u and name='Missing selection';
 config:=public.finance_budget_configuration(u,b);
 perform pg_temp.check_filters(config->'sources'->0->>'id' is null and config->'sources'->0->>'name'='Deleted bank','deleted source retains identity and label');
 perform pg_temp.check_filters((select count(*)=0 from public.finance_budget_matching(u,b,'2026-09-07','2026-09-14')),'deleted selection does not broaden matching');
 begin perform public.finance_budget_mutate(u,'restore',b,2,null,config||'{"start_date":"2026-09-14","source_ids":["b0160000-0000-4000-8000-000000000012"]}','2026-09-14T04:00Z');
  raise exception 'FAILED: missing selection restored'; exception when invalid_parameter_value then null; end;
 perform public.finance_budget_mutate(u,'restore',b,2,null,config||'{"start_date":"2026-09-14","source_ids":[]}','2026-09-14T04:00Z');
 begin insert into public.finance_budget_filters(budget_id,user_id,kind,source_id,category_id,original_id,label)
  values(b,u,'source','b0160000-0000-4000-8000-000000000011','b0160000-0000-4000-8000-000000000011','b0160000-0000-4000-8000-000000000011','Invalid');
  raise exception 'FAILED: mixed filter kinds accepted'; exception when check_violation then null; end;
 begin insert into public.finance_budget_filters(budget_id,user_id,kind,original_id,label)
  values(b,u,'unknown',gen_random_uuid(),'Invalid');
  raise exception 'FAILED: unknown filter kind accepted'; exception when check_violation then null; end;
 perform pg_temp.check_filters(public.finance_budget_close_due('2026-09-21T04:00Z')>=1,'closure works without breakdown storage');
end;
$$;
delete from auth.users where id='b0160000-0000-4000-8000-000000000001';
