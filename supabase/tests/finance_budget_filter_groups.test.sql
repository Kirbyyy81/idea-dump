-- Synthetic owners and ledger only. Every write rolls back.
begin;
create function pg_temp.check_budget_group(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %', label; end if; end $$;
insert into auth.users(id) values ('b0240000-0000-4000-8000-000000000001'),('b0240000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0240000-0000-4000-8000-000000000011','b0240000-0000-4000-8000-000000000001','Synthetic Ryt'),
 ('b0240000-0000-4000-8000-000000000012','b0240000-0000-4000-8000-000000000001','Synthetic TnG');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0240000-0000-4000-8000-000000000021','b0240000-0000-4000-8000-000000000001','Synthetic Food');
insert into public.dim_finance_tags(id,user_id,name) values
 ('b0240000-0000-4000-8000-000000000041','b0240000-0000-4000-8000-000000000001','Synthetic Travel'),
 ('b0240000-0000-4000-8000-000000000042','b0240000-0000-4000-8000-000000000001','Synthetic Event');
insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,transaction_date,status)
select ('b0240000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'b0240000-0000-4000-8000-000000000001',
 case when n & 1 = 1 then 'b0240000-0000-4000-8000-000000000011'::uuid else 'b0240000-0000-4000-8000-000000000012'::uuid end,
 case when n & 2 = 2 then 'b0240000-0000-4000-8000-000000000021'::uuid end,'expense',n+1,'2026-09-14','confirmed'
from generate_series(0,7) n;
insert into public.finance_transaction_tags(transaction_id,tag_id,user_id)
select t.id,g.id,t.user_id from public.finance_transactions t cross join public.dim_finance_tags g
where t.user_id='b0240000-0000-4000-8000-000000000001' and g.user_id=t.user_id and (t.amount::integer-1) & 4 = 4;
set local role service_role;
do $$
declare
 u uuid:='b0240000-0000-4000-8000-000000000001'; b uuid; request uuid:=gen_random_uuid(); cycle uuid;
 config jsonb:='{"name":"Synthetic grouped budget","amount":"100.00","cycle_type":"one_time","start_date":null,"custom_days":null,"anchor_day":null,"time_zone":"Asia/Kuala_Lumpur","filter_logic":"and","include_uncategorised":false,"source_ids":["b0240000-0000-4000-8000-000000000011"],"category_ids":["b0240000-0000-4000-8000-000000000021"],"tag_ids":["b0240000-0000-4000-8000-000000000041","b0240000-0000-4000-8000-000000000042"],"filter_group":{"dimensions":["category","tag"],"logic":"or"}}';
 detail jsonb; frozen jsonb; invalid jsonb; pair jsonb; outer_logic text; inner_logic text;
 populated integer; matched integer; src boolean; cat boolean; tag boolean; pair_value boolean; single_value boolean; expected boolean; actual boolean;
begin
 b:=public.finance_budget_mutate(u,'create',null,null,request,config);
 perform pg_temp.check_budget_group(public.finance_budget_mutate(u,'create',null,null,request,config)=b,'exact replay');
 perform pg_temp.check_budget_group(public.finance_budget_mutate(u,'create',null,null,request,
   jsonb_set(config,'{filter_group,dimensions}','["tag","category"]'))=b,'reversed grouping replay');
 perform pg_temp.check_budget_group(not has_function_privilege('anon','finance_private.budget_filter_matches(text,jsonb,boolean,boolean,boolean)','execute')
   and not has_function_privilege('authenticated','finance_private.normalize_budget_filter_group(jsonb)','execute'),'helpers remain trusted-only');
 begin
  perform public.finance_budget_mutate(u,'create',null,null,request,jsonb_set(config,'{filter_group,logic}','"and"'));
  raise exception 'changed replay accepted'; exception when unique_violation then null;
 end;
 select id into cycle from public.finance_budget_cycles where budget_id=b;
 detail:=public.finance_budget_detail(u,b);
 perform pg_temp.check_budget_group((detail->'transactions'->>'total')::integer=3,'grouped matching list');
 perform pg_temp.check_budget_group(detail->'budget'->'current_cycle'->'metrics'->>'net_spending'='18.00','grouped totals counted once');
 perform pg_temp.check_budget_group((public.finance_budget_dashboard(u,to_char(now(),'YYYY-MM'))->0->'cycle'->'metrics'->>'net_spending')='18.00','dashboard same totals');
 perform public.finance_budget_mutate(u,'update',b,1,null,config-'filter_group');
 perform pg_temp.check_budget_group(public.finance_budget_configuration(u,b)->'filter_group'=config->'filter_group','omitted grouping preserved');
 perform public.finance_budget_mutate(u,'update',b,2,null,config||'{"filter_group":null}');
 perform pg_temp.check_budget_group(public.finance_budget_configuration(u,b)->'filter_group'='null'::jsonb,'explicit null clears');
 perform pg_temp.check_budget_group((public.finance_budget_detail(u,b)->'transactions'->>'total')::integer=1,'ungrouped AND restored');
 begin
  perform public.finance_budget_mutate('b0240000-0000-4000-8000-000000000002','update',b,3,null,config);
  raise exception 'foreign owner accepted'; exception when no_data_found then null;
 end;
 for invalid in select value from jsonb_array_elements('[{},[],false,"and",{"dimensions":["source","source"],"logic":"and"},{"dimensions":["source","tag","category"],"logic":"and"},{"dimensions":["source","tag"],"logic":"xor"},{"dimensions":["source","missing"],"logic":"or"},{"dimensions":["source","tag"],"logic":"or","extra":true}]') loop
  begin
   perform public.finance_budget_mutate(u,'update',b,3,null,jsonb_set(config,'{filter_group}',invalid));
   raise exception 'invalid group accepted'; exception when invalid_parameter_value then null;
  end;
 end loop;
 perform pg_temp.check_budget_group((select revision=3 and filter_group is null from public.finance_budgets where id=b),'invalid writes rolled back');
 perform public.finance_budget_mutate(u,'update',b,3,null,config);
 perform public.finance_budget_mutate(u,'archive',b,4);
 select to_jsonb(c) into frozen from public.finance_budget_cycles c where id=cycle;
 perform pg_temp.check_budget_group(frozen->'configuration_snapshot'->'filter_group'=config->'filter_group','frozen grouping snapshot');
 perform public.finance_budget_mutate(u,'restore',b,5,null,config||'{"filter_group":null}');
 perform pg_temp.check_budget_group((select to_jsonb(c)=frozen from public.finance_budget_cycles c where id=cycle),'restore preserves frozen history');

 b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),
   config||'{"name":"Synthetic grouped recurring","cycle_type":"weekly","start_date":"2026-09-14"}', '2026-09-14T04:00Z');
 select id into cycle from public.finance_budget_cycles where budget_id=b;
 perform public.finance_budget_mutate(u,'update',b,1,null,
   config||'{"name":"Synthetic grouped recurring","cycle_type":"weekly","start_date":"2026-09-14","filter_group":null}', '2026-09-22T04:00Z');
 perform pg_temp.check_budget_group((select configuration_snapshot->'filter_group'=config->'filter_group' and frozen_at is not null
   from public.finance_budget_cycles where id=cycle),'overdue cycle freezes old grouping before edits');

 -- Exhaust every pair, both operators, every empty-card mask and every transaction mask.
 for pair in select value from jsonb_array_elements('[["source","category"],["source","tag"],["category","tag"]]') loop
  foreach outer_logic in array array['and','or'] loop
   foreach inner_logic in array array['and','or'] loop
    for populated in 0..7 loop
     for matched in 0..7 loop
      src:=case when populated & 1=1 then matched & 1=1 end;
      cat:=case when populated & 2=2 then matched & 2=2 end;
      tag:=case when populated & 4=4 then matched & 4=4 end;
      if pair='["source","category"]'::jsonb then
       single_value:=tag;
       if src is null then pair_value:=cat; elsif cat is null then pair_value:=src;
       else pair_value:=case when inner_logic='and' then src and cat else src or cat end; end if;
      elsif pair='["source","tag"]'::jsonb then
       single_value:=cat;
       if src is null then pair_value:=tag; elsif tag is null then pair_value:=src;
       else pair_value:=case when inner_logic='and' then src and tag else src or tag end; end if;
      else
       single_value:=src;
       if cat is null then pair_value:=tag; elsif tag is null then pair_value:=cat;
       else pair_value:=case when inner_logic='and' then cat and tag else cat or tag end; end if;
      end if;
      if single_value is null then expected:=coalesce(pair_value,true);
      elsif pair_value is null then expected:=single_value;
      else expected:=case when outer_logic='and' then single_value and pair_value else single_value or pair_value end; end if;
      actual:=finance_private.budget_filter_matches(outer_logic,jsonb_build_object('dimensions',pair,'logic',inner_logic),src,cat,tag);
      perform pg_temp.check_budget_group(actual=expected,'truth table');
     end loop;
    end loop;
   end loop;
  end loop;
 end loop;
end $$;
reset role;
rollback;
