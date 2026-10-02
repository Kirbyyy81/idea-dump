-- Run on an isolated migrated database. All fixtures roll back.
begin;
create function pg_temp.check_dashboard(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$$;
insert into auth.users(id) values ('d0110000-0000-4000-8000-000000000001'),('d0110000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('d0110000-0000-4000-8000-000000000011','d0110000-0000-4000-8000-000000000001','Dashboard fixture');
set local role service_role;
do $$
declare u uuid := 'd0110000-0000-4000-8000-000000000001'; b uuid; weekly uuid; custom_id uuid;
  config jsonb; result jsonb; saved jsonb; latest jsonb; year_budget uuid;
begin
  config := jsonb_build_object('name','September name','amount','100.00','cycle_type','monthly','start_date','2026-09-01',
    'anchor_day',1,'custom_days',null,'time_zone','Asia/Kuala_Lumpur','filter_logic','and',
    'source_ids','[]'::jsonb,'category_ids','[]'::jsonb,'include_uncategorised',false);
  b := public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-15T00:00Z');
  insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date,status) values
    (u,'d0110000-0000-4000-8000-000000000011','expense',25.01,'2026-09-30','confirmed'),
    (u,'d0110000-0000-4000-8000-000000000011','expense',88,'2026-10-01','confirmed');
  -- A delayed job is caught up by the historical read at actual now.
  result := public.finance_budget_dashboard(u,'2026-09','2026-10-01T00:00Z');
  perform pg_temp.check_dashboard(jsonb_array_length(result)=1,'one September cycle');
  perform pg_temp.check_dashboard(result->0->'cycle'->>'end_date'='2026-10-01','inclusive September end');
  perform pg_temp.check_dashboard(result->0->'cycle'->'metrics'->>'expense'='25.01','September excludes October ledger');
  saved := result;
  perform public.finance_budget_mutate(u,'update',b,1,null,config||'{"name":"October name","amount":"200.00"}','2026-10-01T01:00Z');
  update public.finance_transactions set amount=99 where user_id=u and transaction_date='2026-09-30';
  perform pg_temp.check_dashboard(public.finance_budget_dashboard(u,'2026-09','2026-10-02T00:00Z')=saved,'history retains name amount and spending after edits');
  latest := public.finance_budget_dashboard(u,'2026-10','2026-10-02T00:00Z');
  perform pg_temp.check_dashboard(latest->0->>'name'='October name' and latest->0->'cycle'->'metrics'->>'expense'='88.00','current month remains live');
  perform public.finance_budget_mutate(u,'archive',b,2,null,null,'2026-10-02T01:00Z');
  perform pg_temp.check_dashboard(public.finance_budget_dashboard(u,'2026-09','2026-10-02T02:00Z')=saved,'archived budgets retain earlier cycles');

  weekly := public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||
    '{"name":"Weekly","cycle_type":"weekly","anchor_day":null,"start_date":"2026-08-31"}','2026-09-01T00:00Z');
  result := public.finance_budget_dashboard(u,'2026-09','2026-10-02T00:00Z');
  perform pg_temp.check_dashboard((select count(*) from jsonb_array_elements(result) x where x->>'budget_id'=weekly::text)=4,'all four weekly cycles are separate, not limited to three');
  perform pg_temp.check_dashboard(not exists(select 1 from jsonb_array_elements(result) x where x->'cycle'->>'end_date'='2026-10-05'),'cross-month active cycle excluded from September');
  perform pg_temp.check_dashboard(result=public.finance_budget_dashboard(u,'2026-09','2026-10-02T00:00Z'),'retry order and frozen totals stable');
  perform pg_temp.check_dashboard(public.finance_budget_dashboard(u,'2026-08','2026-10-02T00:00Z')='[]','cycle starting in August belongs to ending month');
  perform pg_temp.check_dashboard(public.finance_budget_dashboard(u,'2026-11','2026-10-02T00:00Z')='[]','future months do not show current budgets');
  perform pg_temp.check_dashboard(public.finance_budget_dashboard('d0110000-0000-4000-8000-000000000002','2026-09','2026-10-02T00:00Z')='[]','owner isolation');

  custom_id := public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||
    '{"name":"Short custom","cycle_type":"custom","custom_days":3,"anchor_day":null,"start_date":"2026-09-01"}','2026-09-01T00:00Z');
  perform public.finance_budget_mutate(u,'archive',custom_id,1,null,null,'2026-09-05T00:00Z');
  result := public.finance_budget_dashboard(u,'2026-09','2026-10-02T00:00Z');
  perform pg_temp.check_dashboard((select count(*) from jsonb_array_elements(result) x where x->>'budget_id'=custom_id::text)=2,'custom completed and partial cycles remain separate');

  year_budget := public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||
    '{"name":"December","start_date":"2026-12-01"}','2026-12-15T00:00Z');
  result := public.finance_budget_dashboard(u,'2026-12','2026-12-31T16:01Z');
  perform pg_temp.check_dashboard(exists(select 1 from jsonb_array_elements(result) x where x->>'budget_id'=year_budget::text
    and x->'cycle'->>'end_date'='2027-01-01' and x->'cycle'->>'frozen_at' is not null),'KL year boundary treats December as historical');
  begin perform public.finance_budget_dashboard(u,'2026-13'); raise exception 'FAILED: invalid month accepted';
    exception when invalid_parameter_value then null; end;
  begin perform public.finance_budget_dashboard(u,null); raise exception 'FAILED: null month accepted';
    exception when invalid_parameter_value then null; end;
end;
$$;
reset role;
select pg_temp.check_dashboard(not has_function_privilege('anon','public.finance_budget_dashboard(uuid,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.finance_budget_dashboard(uuid,text,timestamptz)','execute'),'no browser RPC access');
rollback;
