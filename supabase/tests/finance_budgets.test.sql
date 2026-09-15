-- Run only on an isolated migrated database. All synthetic records roll back.
begin;
create function pg_temp.check_budget(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$$;
create function pg_temp.budget_config(name text,start_date text default '2026-01-31',cycle text default 'weekly') returns jsonb language sql as $$
select jsonb_build_object('name',name,'amount','100.00','cycle_type',cycle,'start_date',start_date,'custom_days',case when cycle='custom' then 1 end,
  'anchor_day',case when cycle='monthly' then 31 end,'time_zone','Asia/Kuala_Lumpur','filter_logic','and','include_uncategorised',false,'source_ids','[]'::jsonb,'category_ids','[]'::jsonb);
$$;
insert into auth.users(id) values('b0110000-0000-4000-8000-000000000001'),('b0110000-0000-4000-8000-000000000002'),('b0110000-0000-4000-8000-000000000003');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0110000-0000-4000-8000-000000000011','b0110000-0000-4000-8000-000000000001','Budget Bank'),
 ('b0110000-0000-4000-8000-000000000012','b0110000-0000-4000-8000-000000000001','Budget Cash'),
 ('b0110000-0000-4000-8000-000000000013','b0110000-0000-4000-8000-000000000001','Unused source'),
 ('b0110000-0000-4000-8000-000000000014','b0110000-0000-4000-8000-000000000002','Other owner'),
 ('b0110000-0000-4000-8000-000000000015','b0110000-0000-4000-8000-000000000003','Calendar owner');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0110000-0000-4000-8000-000000000021','b0110000-0000-4000-8000-000000000001','Budget Food'),
 ('b0110000-0000-4000-8000-000000000022','b0110000-0000-4000-8000-000000000001','Unused category');
insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,transaction_date,status) values
 ('b0110000-0000-4000-8000-000000000031','b0110000-0000-4000-8000-000000000001','b0110000-0000-4000-8000-000000000011','b0110000-0000-4000-8000-000000000021','expense',70,'2026-01-31','confirmed'),
 ('b0110000-0000-4000-8000-000000000032','b0110000-0000-4000-8000-000000000001','b0110000-0000-4000-8000-000000000011','b0110000-0000-4000-8000-000000000021','income',20,'2026-01-31','confirmed'),
 ('b0110000-0000-4000-8000-000000000033','b0110000-0000-4000-8000-000000000001','b0110000-0000-4000-8000-000000000012',null,'expense',40,'2026-02-01','confirmed'),
 ('b0110000-0000-4000-8000-000000000034','b0110000-0000-4000-8000-000000000001','b0110000-0000-4000-8000-000000000011',null,'expense',999,'2026-01-31','review'),
 ('b0110000-0000-4000-8000-000000000035','b0110000-0000-4000-8000-000000000001','b0110000-0000-4000-8000-000000000011',null,'expense',10,'2026-01-30','confirmed');

-- Calendar starts include spending earlier in the current period without generating old cycles.
do $$
declare u uuid:='b0110000-0000-4000-8000-000000000003'; b uuid; scheduled uuid; config jsonb; summary jsonb;
begin
  insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date) values
    (u,'b0110000-0000-4000-8000-000000000015','expense',25,'2026-09-02');
  config:=pg_temp.budget_config('Calendar month','2026-09-01','monthly')||'{"anchor_day":1}';
  b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-15T04:00Z');
  summary:=public.finance_budget_summary(u,b,'2026-09-15T04:00Z');
  perform pg_temp.check_budget(summary->'current_cycle'->>'start_date'='2026-09-01' and summary->'current_cycle'->>'end_date'='2026-10-01','monthly calendar bounds');
  perform pg_temp.check_budget(summary->'current_cycle'->'metrics'->>'expense'='25.00','spending before budget creation counts');
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Prior month","start_date":"2026-08-31"}','2026-09-15T04:00Z');
    raise exception 'FAILED: prior month accepted'; exception when invalid_parameter_value then null; end;
  perform public.finance_budget_mutate(u,'archive',b,1,null,null,'2026-09-15T05:00Z');
  begin perform public.finance_budget_mutate(u,'restore',b,2,null,config,'2026-09-15T06:00Z');
    raise exception 'FAILED: restore retroactively overlaps history'; exception when invalid_parameter_value then null; end;
  config:=pg_temp.budget_config('Calendar week','2026-09-14','weekly');
  b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-09-20T04:00Z');
  summary:=public.finance_budget_summary(u,b,'2026-09-20T04:00Z');
  perform pg_temp.check_budget(summary->'current_cycle'->>'end_date'='2026-09-21','weekly Monday to Sunday');
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Prior week","start_date":"2026-09-13"}','2026-09-20T04:00Z');
    raise exception 'FAILED: prior week accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),pg_temp.budget_config('Past custom','2026-09-14','custom'),'2026-09-20T04:00Z');
    raise exception 'FAILED: backdated custom cycle'; exception when invalid_parameter_value then null; end;
  scheduled:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),pg_temp.budget_config('Change scheduled','2026-10-01','monthly'),'2026-09-15T04:00Z');
  perform public.finance_budget_mutate(u,'update',scheduled,1,null,pg_temp.budget_config('Change scheduled','2026-09-01','monthly'),'2026-09-15T04:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,scheduled,'2026-09-15T04:00Z')->>'state'='active','scheduled edit may select current period');
  perform public.finance_budget_mutate(u,'archive',b,1,null,null,'2026-09-20T05:00Z');
  perform public.finance_budget_mutate(u,'archive',scheduled,2,null,null,'2026-09-15T05:00Z');
end;
$$;

do $$
declare u uuid:='b0110000-0000-4000-8000-000000000001'; other_user uuid:='b0110000-0000-4000-8000-000000000002';
  b uuid; b2 uuid; future_id uuid; id1 uuid; id2 uuid; config jsonb; result jsonb; before_history jsonb; c uuid; revision integer;
begin
  perform pg_temp.check_budget(public.finance_budget_next_boundary('2024-01-31','monthly',null,31)='2024-02-29','leap February clamp');
  perform pg_temp.check_budget(public.finance_budget_next_boundary('2024-02-29','monthly',null,31)='2024-03-31','original monthly anchor retained');
  perform pg_temp.check_budget(public.finance_budget_next_boundary('2026-12-31','weekly',null,null)='2027-01-07','weekly year boundary');
  perform pg_temp.check_budget(public.finance_budget_next_boundary('2026-01-31','custom',365,null)='2027-01-31','365-day cycle');
  perform pg_temp.check_budget(public.finance_budget_next_boundary('2026-02-03','monthly',null,15)='2026-02-15','shortened first monthly cycle');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,0,20,'2026-01-01','2026-01-08','2026-01-01')->>'remaining'='100.00','negative net cannot increase remaining');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,0,20,'2026-01-01','2026-01-08','2026-01-01')->>'net_spending'='-20.00','negative net visible');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,1,0,'2026-01-01','2026-01-08','2026-01-01')->>'status'='needs_attention','first-day pace starts at zero');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,80,0,'2026-01-01','2026-01-08','2026-01-08')->>'status'='needs_attention','80 percent threshold');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,100,0,'2026-01-01','2026-01-08','2026-01-01')->>'status'='limit_reached','100 percent precedence');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,101,0,'2026-01-01','2026-01-08','2026-01-01')->>'status'='over_budget','over limit precedence');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,1,0,'2026-01-01','2026-01-08','2026-01-02')->>'status'='on_track','within pace');
  perform pg_temp.check_budget(public.finance_budget_metrics(100,900719925474099.99,0,'2026-01-01','2026-01-08','2026-01-02')->>'expense'='900719925474099.99','aggregate precision exceeds JS safe integer');

  config:=pg_temp.budget_config('All spending');
  b:=public.finance_budget_mutate(u,'create',null,null,'b0110000-0000-4000-8000-000000000041',config,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(b=public.finance_budget_mutate(u,'create',null,null,'b0110000-0000-4000-8000-000000000041',config,'2026-02-01T00:00Z'),'creation retry returns existing identity');
  result:=public.finance_budget_detail(u,b,1,20,1,50,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(result->'budget'->'current_cycle'->'metrics'->>'net_spending'='90.00','expenses minus income, confirmed rows only');
  perform pg_temp.check_budget(result->'transactions'->>'total'='3','current transaction drilldown matches aggregate');
  perform pg_temp.check_budget(jsonb_array_length(result->'budget'->'current_cycle'->'breakdowns')=4,'both source and category breakdowns');
  begin perform public.finance_budget_mutate(u,'create',null,null,'b0110000-0000-4000-8000-000000000041',config||'{"amount":"99.00"}','2026-01-31T00:00Z');
    raise exception 'FAILED: changed idempotency payload accepted'; exception when unique_violation then null; end;
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"  ALL SPENDING  "}','2026-01-31T00:00Z');
    raise exception 'FAILED: duplicate name accepted'; exception when unique_violation then null; end;
  begin perform public.finance_budget_detail(other_user,b); raise exception 'FAILED: cross-owner detail'; exception when no_data_found then null; end;
  begin perform public.finance_budget_mutate(u,'update',b,999,null,config,'2026-01-31T00:00Z'); raise exception 'FAILED: stale revision'; exception when serialization_failure then null; end;
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Invalid","source_ids":["b0110000-0000-4000-8000-000000000014"]}','2026-01-31T00:00Z');
    raise exception 'FAILED: cross-owner source'; exception when invalid_parameter_value then null; end;
  begin perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Invalid","time_zone":"Invalid/Zone"}','2026-01-31T00:00Z');
    raise exception 'FAILED: invalid zone'; exception when invalid_parameter_value then null; end;

  config:=pg_temp.budget_config('Filtered')||'{"source_ids":["b0110000-0000-4000-8000-000000000011"],"category_ids":["b0110000-0000-4000-8000-000000000021"]}';
  b2:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-01-31T00:00Z');
  begin update public.finance_budget_version_sources set label='Changed' where version_id=(select current_version_id from public.finance_budgets where id=b2);
    raise exception 'FAILED: changed saved selection'; exception when check_violation then null; end;
  begin delete from public.finance_budget_version_sources where version_id=(select current_version_id from public.finance_budgets where id=b2);
    raise exception 'FAILED: deleted saved selection'; exception when check_violation then null; end;
  begin insert into public.finance_budget_version_sources(version_id,user_id,source_id,original_id,label)
    select current_version_id,u,'b0110000-0000-4000-8000-000000000012','b0110000-0000-4000-8000-000000000012','Late' from public.finance_budgets where id=b2;
    raise exception 'FAILED: broadened saved selection'; exception when check_violation then null; end;
  perform pg_temp.check_budget(public.finance_budget_summary(u,b2,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'net_spending'='50.00','AND matching');
  config:=config||'{"category_ids":[],"include_uncategorised":true,"filter_logic":"or"}';
  perform public.finance_budget_mutate(u,'update',b2,1,null,config,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,b2,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'net_spending'='90.00','OR matching with explicit Uncategorised');
  config:=config||'{"source_ids":[]}';
  perform public.finance_budget_mutate(u,'update',b2,2,null,config,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,b2,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'net_spending'='40.00','category-only Uncategorised');
  config:=config||'{"source_ids":["b0110000-0000-4000-8000-000000000011"],"category_ids":[],"include_uncategorised":false}';
  perform public.finance_budget_mutate(u,'update',b2,3,null,config,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,b2,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'net_spending'='50.00','source-only matching');
  update public.dim_finance_sources set is_archived=true where id='b0110000-0000-4000-8000-000000000011';
  perform pg_temp.check_budget(public.finance_budget_summary(u,b2,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'net_spending'='50.00','archived source still counts');
  update public.dim_finance_sources set is_archived=false where id='b0110000-0000-4000-8000-000000000011';

  future_id:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),pg_temp.budget_config('Future','2026-02-15'),'2026-01-31T00:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,future_id,'2026-01-31T00:00Z')->>'state'='scheduled','future schedule');
  perform pg_temp.check_budget(public.finance_budget_summary(u,future_id,'2026-01-31T00:00Z')->'current_cycle'->'metrics'->>'used_amount'='0.00','scheduled has no spending');
  perform public.finance_budget_mutate(u,'archive',future_id,1,null,null,'2026-01-31T00:00Z');
  perform pg_temp.check_budget(not exists(select 1 from public.finance_budget_cycles where budget_id=future_id),'scheduled archive creates no history');

  perform public.finance_budget_reconcile(u,b,'2026-02-07T00:00Z');
  before_history:=public.finance_budget_detail(u,b,1,20,1,50,'2026-02-07T00:00Z')->'history';
  perform pg_temp.check_budget(before_history->>'total'='1','first completed cycle frozen');
  update public.finance_transactions set amount=900 where id='b0110000-0000-4000-8000-000000000031';
  delete from public.finance_transactions where id='b0110000-0000-4000-8000-000000000032';
  insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date) values(u,'b0110000-0000-4000-8000-000000000011','expense',15,'2026-02-01');
  update public.dim_finance_sources set name='Renamed Bank' where id='b0110000-0000-4000-8000-000000000011';
  perform pg_temp.check_budget(public.finance_budget_detail(u,b,1,20,1,50,'2026-02-07T00:00Z')->'history'=before_history,'late entries, ledger edits/deletes and label changes preserve history');
  perform public.finance_budget_reconcile(u,b,'2026-02-07T00:00Z');
  perform pg_temp.check_budget((select count(*)=2 from public.finance_budget_cycles where budget_id=b),'closure retry creates no duplicate successor');
  select id into c from public.finance_budget_cycles where budget_id=b and frozen_at is not null;
  begin update public.finance_budget_cycles set expense=1 where id=c; raise exception 'FAILED: frozen cycle changed'; exception when check_violation then null; end;
  begin update public.finance_budget_cycle_breakdowns set label='Changed' where cycle_id=c; raise exception 'FAILED: frozen labels changed'; exception when check_violation then null; end;

  config:=pg_temp.budget_config('All spending')||'{"cycle_type":"monthly","anchor_day":15}';
  perform public.finance_budget_mutate(u,'update',b,1,null,config,'2026-02-09T00:00Z');
  result:=public.finance_budget_detail(u,b,1,20,1,50,'2026-02-09T00:00Z');
  perform pg_temp.check_budget(result->'history'->>'total'='2','schedule edit freezes partial history');
  perform pg_temp.check_budget(result->'history'->'data'->0->>'end_date'='2026-02-09','partial stops before today');
  perform pg_temp.check_budget(result->'budget'->'current_cycle'->>'end_date'='2026-02-15','monthly edit short first cycle');
  config:=config||'{"start_date":"2026-02-09","anchor_day":20}';
  perform public.finance_budget_mutate(u,'update',b,2,null,config,'2026-02-09T00:00Z');
  perform pg_temp.check_budget(public.finance_budget_detail(u,b,1,20,1,50,'2026-02-09T00:00Z')->'history'->>'total'='2','first-day schedule edit has no zero-day partial');
  perform public.finance_budget_mutate(u,'archive',b,3,null,null,'2026-02-09T03:00Z');
  config:=config||'{"start_date":"2026-02-09"}';
  perform public.finance_budget_mutate(u,'restore',b,4,null,config,'2026-02-09T04:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,b,'2026-02-09T04:00Z')->'current_cycle'->>'start_date'='2026-02-09','same-day restore starts today');
  perform pg_temp.check_budget(public.finance_budget_detail(u,b,1,20,1,50,'2026-02-09T04:00Z')->'history'->>'total'='3','restore preserves all history');

  config:=pg_temp.budget_config('Reference guard')||'{"source_ids":["b0110000-0000-4000-8000-000000000013"],"category_ids":["b0110000-0000-4000-8000-000000000022"]}';
  id1:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-01-31T00:00Z');
  begin perform public.finance_delete_source(u,'b0110000-0000-4000-8000-000000000013'); raise exception 'FAILED: active source deletion'; exception when foreign_key_violation then null; end;
  begin perform public.finance_delete_category(u,'b0110000-0000-4000-8000-000000000022'); raise exception 'FAILED: active category deletion'; exception when foreign_key_violation then null; end;
  perform public.finance_budget_mutate(u,'archive',id1,1,null,null,'2026-01-31T01:00Z');
  perform public.finance_delete_source(u,'b0110000-0000-4000-8000-000000000013');
  perform public.finance_delete_category(u,'b0110000-0000-4000-8000-000000000022');
  perform pg_temp.check_budget(public.finance_budget_summary(u,id1,'2026-01-31T01:00Z')->'version'->'sources'->0->>'name'='Unused source','deleted selection label retained');
  begin perform public.finance_budget_mutate(u,'restore',id1,2,null,config,'2026-01-31T02:00Z'); raise exception 'FAILED: restore missing selection'; exception when invalid_parameter_value then null; end;
  config:=config||'{"source_ids":[],"category_ids":[]}';
  perform public.finance_budget_mutate(u,'restore',id1,2,null,config,'2026-01-31T02:00Z');
  perform pg_temp.check_budget(public.finance_budget_summary(u,id1,'2026-01-31T02:00Z')->>'state'='active','explicit filter repair permits restore');

  id2:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),pg_temp.budget_config('Daily','2026-01-31','custom'),'2026-01-31T00:00Z');
  perform public.finance_budget_close_due('2026-02-04T00:00Z');
  perform public.finance_budget_close_due('2026-02-04T00:00Z');
  perform pg_temp.check_budget((select count(*)=5 from public.finance_budget_cycles where budget_id=id2),'cron catches missed one-day cycles once');
  perform pg_temp.check_budget((select count(*)=1 from public.finance_budget_cycles where budget_id=id2 and frozen_at is null),'one open successor');
  result:=public.finance_budget_list(u,'active',1,3,true,'2026-02-09T05:00Z');
  perform pg_temp.check_budget(jsonb_array_length(result->'data')=3,'dashboard limits to three active budgets');
  result:=public.finance_budget_list(u,'all',1,2,false,'2026-02-09T05:00Z');
  perform pg_temp.check_budget(jsonb_array_length(result->'data')=2 and (result->>'total')::integer>2,'list pagination returns full count');
  result:=public.finance_budget_detail(u,id2,2,1,1,1,'2026-02-09T05:00Z');
  perform pg_temp.check_budget(jsonb_array_length(result->'history'->'data')=1 and result->'history'->>'page'='2','history pagination');
  perform pg_temp.check_budget(public.finance_budget_list(other_user,'all',1,20,false,'2026-02-09T05:00Z')->>'total'='0','tenant isolated lists');
end;
$$;

do $$
declare t text; fn record;
begin
  foreach t in array array['finance_budgets','finance_budget_versions','finance_budget_version_sources','finance_budget_version_categories','finance_budget_cycles','finance_budget_cycle_breakdowns'] loop
    perform pg_temp.check_budget((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),t||' RLS enabled');
    perform pg_temp.check_budget(not has_table_privilege('anon','public.'||t,'select,insert,update,delete'),t||' anonymous denied');
    perform pg_temp.check_budget(not has_table_privilege('authenticated','public.'||t,'select,insert,update,delete'),t||' browser denied');
  end loop;
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'finance_budget_%' loop
    perform pg_temp.check_budget(not has_function_privilege('anon',fn.oid,'execute') and not has_function_privilege('authenticated',fn.oid,'execute'),'browser cannot execute budget functions');
  end loop;
  perform pg_temp.check_budget(has_function_privilege('service_role','public.finance_budget_mutate(uuid,text,uuid,integer,uuid,jsonb,timestamptz)','execute'),'server can mutate');
  perform pg_temp.check_budget(not has_function_privilege('service_role','public.finance_budget_close_due(timestamptz)','execute'),'global closure remains operator-only');
  perform pg_temp.check_budget((select count(*)=1 from cron.job where jobname='finance-budget-closure' and active),'one registered cron job');
end;
$$;
-- Exercise the actual invoker role, which does not need SELECT on auth.users.
set local role service_role;
do $$
declare u uuid:='b0110000-0000-4000-8000-000000000002'; b uuid; config jsonb; frozen jsonb;
begin
  config:=pg_temp.budget_config('Server role','2026-01-31','monthly')||'{"source_ids":["b0110000-0000-4000-8000-000000000014"]}';
  b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config,'2026-01-31T00:00Z');
  config:=config||'{"anchor_day":15}';
  perform public.finance_budget_mutate(u,'update',b,1,null,config,'2026-01-31T01:00Z');
  begin perform public.finance_delete_source(u,'b0110000-0000-4000-8000-000000000014');
    raise exception 'FAILED: server role active deletion'; exception when foreign_key_violation then null; end;
  insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date) values
    (u,'b0110000-0000-4000-8000-000000000014','expense',10,'2026-01-31'),
    (u,'b0110000-0000-4000-8000-000000000014','expense',100,'2026-02-01');
  perform public.finance_budget_mutate(u,'archive',b,2,null,null,'2026-01-31T02:00Z');
  frozen:=public.finance_budget_detail(u,b,1,20,1,50,'2026-01-31T02:00Z')->'history';
  perform pg_temp.check_budget(frozen->'data'->0->'metrics'->>'expense'='10.00','archive includes today but excludes future ledger dates');
  insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date) values
    (u,'b0110000-0000-4000-8000-000000000014','expense',50,'2026-01-31');
  perform pg_temp.check_budget(public.finance_budget_detail(u,b,1,20,1,50,'2026-01-31T03:00Z')->'history'=frozen,'later same-day commits cannot change archived totals');
  begin insert into public.finance_budget_cycle_breakdowns(cycle_id,user_id,dimension,reference_id,label,expense,income,net_spending)
    values((frozen->'data'->0->>'id')::uuid,u,'category',gen_random_uuid(),'Late',1,0,1);
    raise exception 'FAILED: added frozen breakdown'; exception when check_violation then null; end;
  perform public.finance_budget_mutate(u,'restore',b,3,null,config,'2026-01-31T04:00Z');
  perform public.finance_budget_reconcile(u,b,'2026-03-01T04:00Z');
  perform pg_temp.check_budget(public.finance_budget_detail(u,b,1,20,1,50,'2026-03-01T04:00Z')->'history'->>'total'='2','trusted role restores and closes cycles');
end;
$$;
reset role;

-- Even an accidental future table grant must not open browser access.
grant select on public.finance_budgets to authenticated;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.finance_budgets) then raise exception 'FAILED: RLS exposes budgets'; end if;
  begin perform public.finance_budget_list('b0110000-0000-4000-8000-000000000001');
    raise exception 'FAILED: authenticated RPC access'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin perform public.finance_budget_list('b0110000-0000-4000-8000-000000000001');
    raise exception 'FAILED: anonymous RPC access'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set constraints all immediate;
rollback;
