-- Synthetic owners only. Every write rolls back.
begin;
create function pg_temp.check_exclusion(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('b0250000-0000-4000-8000-000000000001'),('b0250000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0250000-0000-4000-8000-000000000011','b0250000-0000-4000-8000-000000000001','Synthetic Bank'),
 ('b0250000-0000-4000-8000-000000000012','b0250000-0000-4000-8000-000000000001','Synthetic Wallet');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0250000-0000-4000-8000-000000000031','b0250000-0000-4000-8000-000000000001','Synthetic Food'),
 ('b0250000-0000-4000-8000-000000000032','b0250000-0000-4000-8000-000000000001','Synthetic Shopping');
insert into public.dim_finance_tags(id,user_id,name,is_archived) values
 ('b0250000-0000-4000-8000-000000000021','b0250000-0000-4000-8000-000000000001','Synthetic Travel',false),
 ('b0250000-0000-4000-8000-000000000022','b0250000-0000-4000-8000-000000000001','Synthetic Work',false),
 ('b0250000-0000-4000-8000-000000000023','b0250000-0000-4000-8000-000000000001','Synthetic Keep',false),
 ('b0250000-0000-4000-8000-000000000024','b0250000-0000-4000-8000-000000000001','Synthetic Archived',true),
 ('b0250000-0000-4000-8000-000000000025','b0250000-0000-4000-8000-000000000002','Synthetic Foreign',false),
 ('b0250000-0000-4000-8000-000000000026','b0250000-0000-4000-8000-000000000001','Synthetic Deleted',false);
insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,transaction_date,status)
select ('b0250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'b0250000-0000-4000-8000-000000000001',
 case when n=103 then 'b0250000-0000-4000-8000-000000000012'::uuid else 'b0250000-0000-4000-8000-000000000011'::uuid end,
 case when n=105 then 'b0250000-0000-4000-8000-000000000032'::uuid else 'b0250000-0000-4000-8000-000000000031'::uuid end,
 case when n>=107 then 'income' else 'expense' end,amount,'2026-09-14','confirmed'
from (values(101,50),(102,20),(103,30),(104,40),(105,60),(106,90),(107,10),(108,5)) fixture(n,amount);
insert into public.finance_transaction_tags(transaction_id,user_id,tag_id)
select ('b0250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'b0250000-0000-4000-8000-000000000001',
 ('b0250000-0000-4000-8000-'||lpad(tag::text,12,'0'))::uuid
from (values(102,21),(102,23),(103,22),(104,21),(104,22),(104,23),(105,23),(106,21),(107,21)) fixture(n,tag);
set local role service_role;
do $$
declare u uuid:='b0250000-0000-4000-8000-000000000001'; b uuid; request uuid:=gen_random_uuid(); c uuid; detail jsonb;
 config jsonb:='{"name":"Synthetic exclusions","amount":"1000.00","cycle_type":"one_time","start_date":null,"time_zone":"Asia/Kuala_Lumpur","filter_logic":"and","include_uncategorised":false,"source_ids":[],"category_ids":[],"tag_ids":[],"excluded_tag_ids":["b0250000-0000-4000-8000-000000000021"]}';
 invalid jsonb; revision integer; frozen jsonb; temp_budget uuid; yesterday date:=(now() at time zone 'Asia/Kuala_Lumpur')::date-1;
begin
 -- A tagged bank payment becomes allocations whose own tags control matching.
 perform public.finance_save_transaction_split(u,'b0250000-0000-4000-8000-000000000106',
  public.finance_get_transaction_split(u,'b0250000-0000-4000-8000-000000000106')->>'version',
  '[{"amount":"60.00","category_id":"b0250000-0000-4000-8000-000000000031","tag_ids":["b0250000-0000-4000-8000-000000000023"]},{"amount":"30.00","category_id":"b0250000-0000-4000-8000-000000000031","tag_ids":["b0250000-0000-4000-8000-000000000021"]}]');
 b:=public.finance_budget_mutate(u,'create',null,null,request,config);
 perform pg_temp.check_exclusion(public.finance_budget_mutate(u,'create',null,null,request,config)=b,'idempotent replay');
 begin
  perform public.finance_budget_mutate(u,'create',null,null,request,config||'{"excluded_tag_ids":[]}');
  raise exception 'changed replay accepted'; exception when unique_violation then null;
 end;
 detail:=public.finance_budget_detail(u,b);
 perform pg_temp.check_exclusion(detail->'budget'->'current_cycle'->'metrics'->>'expense'='200.00','excluded expenses and split allocation');
 perform pg_temp.check_exclusion(detail->'budget'->'current_cycle'->'metrics'->>'income'='5.00','excluded income');
 perform pg_temp.check_exclusion(detail->'budget'->'current_cycle'->'metrics'->>'net_spending'='195.00','net spending');
 perform pg_temp.check_exclusion((detail->'transactions'->>'total')::integer=5,'only matching ledger entries listed');
 perform pg_temp.check_exclusion((select sum((x->>'amount')::numeric) filter(where x->>'direction'='expense')=200
  from jsonb_array_elements(detail->'transactions'->'data') x),'list and totals agree');
 perform pg_temp.check_exclusion(public.finance_budget_configuration(u,b)->'excluded_tags'->0->>'name'='Synthetic Travel','saved metadata');
 perform pg_temp.check_exclusion((public.finance_budget_dashboard(u,to_char(now(),'YYYY-MM'))->0->'cycle'->'metrics'->>'net_spending')='195.00','cumulative dashboard');
 perform public.finance_budget_mutate(u,'update',b,1,null,config-'excluded_tag_ids');
 perform pg_temp.check_exclusion(public.finance_budget_configuration(u,b)->'excluded_tag_ids'=config->'excluded_tag_ids','omitted preserves');
 perform public.finance_budget_mutate(u,'update',b,2,null,config||'{"excluded_tag_ids":[]}');
 perform pg_temp.check_exclusion(public.finance_budget_configuration(u,b)->'excluded_tags'='[]'::jsonb,'empty clears');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='275.00','whole open one-time recalculated');
 perform public.finance_budget_mutate(u,'update',b,3,null,config||'{"excluded_tag_ids":["b0250000-0000-4000-8000-000000000021","b0250000-0000-4000-8000-000000000022"]}');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='165.00','any of multiple exclusions');
 perform public.finance_budget_mutate(u,'update',b,4,null,config||'{"source_ids":["b0250000-0000-4000-8000-000000000011"],"category_ids":["b0250000-0000-4000-8000-000000000031"]}');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='105.00','AND before exclusion');
 perform public.finance_budget_mutate(u,'update',b,5,null,config||'{"filter_logic":"or","source_ids":["b0250000-0000-4000-8000-000000000011"],"category_ids":["b0250000-0000-4000-8000-000000000031"],"filter_group":{"dimensions":["source","category"],"logic":"or"}}');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='195.00','grouped OR cannot bypass exclusion');
 perform public.finance_budget_mutate(u,'update',b,6,null,config||'{"filter_group":null,"tag_ids":["b0250000-0000-4000-8000-000000000023"]}');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='120.00','mixed tags veto without duplicate counts');
 perform public.finance_budget_mutate(u,'update',b,7,null,config||'{"tag_ids":["b0250000-0000-4000-8000-000000000021"]}');
 perform pg_temp.check_exclusion((public.finance_budget_detail(u,b)->'transactions'->>'total')::integer=0,'overlapping inclusion excluded');
 perform public.finance_budget_mutate(u,'update',b,8,null,config);
 begin
  perform public.finance_budget_mutate(u,'update',b,8,null,config);
  raise exception 'stale revision accepted'; exception when serialization_failure then null;
 end;
 for invalid in select value from jsonb_array_elements('[null,"tag",[null],[7],["bad"],["b0250000-0000-4000-8000-000000000025"],["b0250000-0000-4000-8000-000000000024"]]') loop
  begin
   perform public.finance_budget_mutate(u,'update',b,9,null,jsonb_set(config,'{excluded_tag_ids}',invalid));
   raise exception 'invalid exclusion accepted'; exception when invalid_parameter_value then
    perform pg_temp.check_exclusion(sqlerrm='excluded_tag_ids','owned active UUID validation field');
  end;
 end loop;
 begin
  perform public.finance_budget_mutate(u,'update',b,9,null,jsonb_set(config,'{excluded_tag_ids}',
   (select jsonb_agg(gen_random_uuid()) from generate_series(1,51))));
  raise exception '51 exclusions accepted'; exception when invalid_parameter_value then null;
 end;
 -- Changing exclusions recalculates the entire existing recurring window.
 temp_budget:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||
  '{"name":"Synthetic recurring exclusions","cycle_type":"monthly","start_date":"2026-09-01","anchor_day":1}', '2026-09-14T04:00Z');
 select id into c from public.finance_budget_cycles where budget_id=temp_budget;
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,temp_budget,1,20,1,50,'2026-09-14T04:00Z')->'budget'->'current_cycle'->'metrics'->>'net_spending'='195.00','recurring initial total');
 perform public.finance_budget_mutate(u,'update',temp_budget,1,null,config||
  '{"name":"Synthetic recurring exclusions","cycle_type":"monthly","start_date":"2026-09-01","anchor_day":1,"excluded_tag_ids":["b0250000-0000-4000-8000-000000000021","b0250000-0000-4000-8000-000000000022"]}', '2026-09-15T04:00Z');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,temp_budget,1,20,1,50,'2026-09-15T04:00Z')->'budget'->'current_cycle'->'metrics'->>'net_spending'='165.00'
  and (select frozen_at is null from public.finance_budget_cycles where id=c),'existing open window recalculated without replacement');
 perform public.finance_budget_mutate(u,'archive',temp_budget,2,null,null,'2026-09-15T04:00Z');
 update public.dim_finance_tags set is_archived=true where id='b0250000-0000-4000-8000-000000000021';
 perform public.finance_budget_mutate(u,'update',b,9,null,config-'excluded_tag_ids');
 perform pg_temp.check_exclusion((public.finance_budget_configuration(u,b)->'excluded_tags'->0->>'is_archived')::boolean,'archived reference retained');
 perform pg_temp.check_exclusion(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='195.00','archived exclusion still effective');
 begin
  delete from public.dim_finance_tags where id='b0250000-0000-4000-8000-000000000021';
  raise exception 'active exclusion tag deleted'; exception when foreign_key_violation then null;
 end;
 -- Freeze before a tag membership write, even with no inclusion filters.
 insert into public.finance_transactions(id,user_id,source_id,direction,amount,transaction_date,status)
 values('b0250000-0000-4000-8000-000000000109',u,'b0250000-0000-4000-8000-000000000011','expense',8,yesterday,'confirmed');
 temp_budget:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||jsonb_build_object(
  'name','Synthetic daily exclusion','cycle_type','custom','custom_days',1,'start_date',yesterday,
  'excluded_tag_ids',jsonb_build_array('b0250000-0000-4000-8000-000000000022')),yesterday::timestamp at time zone 'Asia/Kuala_Lumpur');
 select id into c from public.finance_budget_cycles where budget_id=temp_budget;
 insert into public.finance_transaction_tags(user_id,transaction_id,tag_id)
 values(u,'b0250000-0000-4000-8000-000000000109','b0250000-0000-4000-8000-000000000022');
 select to_jsonb(x) into frozen from public.finance_budget_cycles x where id=c;
 perform pg_temp.check_exclusion(frozen->>'frozen_at' is not null and frozen->>'expense'='8.00','exclusion-only budget reconciles before tag addition');
 perform pg_temp.check_exclusion(frozen->'configuration_snapshot'->'excluded_tag_ids'=jsonb_build_array('b0250000-0000-4000-8000-000000000022'),'frozen exclusion snapshot');
 delete from public.finance_transaction_tags where transaction_id='b0250000-0000-4000-8000-000000000109';
 update public.finance_transactions set amount=9 where id='b0250000-0000-4000-8000-000000000109';
 perform pg_temp.check_exclusion((select to_jsonb(x)=frozen from public.finance_budget_cycles x where id=c),'tag removal and ledger edit preserve frozen history');
 -- Tag addition/removal updates cumulative open totals immediately.
 insert into public.finance_transaction_tags(user_id,transaction_id,tag_id)
 values(u,'b0250000-0000-4000-8000-000000000101','b0250000-0000-4000-8000-000000000022');
 perform public.finance_budget_mutate(u,'update',b,10,null,config||'{"excluded_tag_ids":["b0250000-0000-4000-8000-000000000022"]}');
 perform pg_temp.check_exclusion(not exists(select 1 from public.finance_budget_matching(u,b,null,null) where id='b0250000-0000-4000-8000-000000000101'),'new tag veto');
 delete from public.finance_transaction_tags where transaction_id='b0250000-0000-4000-8000-000000000101';
 perform pg_temp.check_exclusion(exists(select 1 from public.finance_budget_matching(u,b,null,null) where id='b0250000-0000-4000-8000-000000000101'),'removed tag includes again');
 -- Archived settings retain deleted names and require repair before restoration.
 temp_budget:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Synthetic deleted exclusion","excluded_tag_ids":["b0250000-0000-4000-8000-000000000026"]}');
 perform public.finance_budget_mutate(u,'archive',temp_budget,1);
 delete from public.dim_finance_tags where id='b0250000-0000-4000-8000-000000000026';
 perform pg_temp.check_exclusion(public.finance_budget_configuration(u,temp_budget)->'excluded_tags'->0->>'id' is null
  and public.finance_budget_configuration(u,temp_budget)->'excluded_tags'->0->>'name'='Synthetic Deleted','deleted selection metadata');
 begin
  perform public.finance_budget_mutate(u,'restore',temp_budget,2,null,config-'excluded_tag_ids');
  raise exception 'deleted exclusion restored'; exception when invalid_parameter_value then null;
 end;
 perform public.finance_budget_mutate(u,'restore',temp_budget,2,null,config||'{"name":"Synthetic deleted exclusion","excluded_tag_ids":[]}');
 perform pg_temp.check_exclusion(public.finance_budget_configuration(u,temp_budget)->'excluded_tags'='[]'::jsonb,'explicit repair restores');
end $$;
reset role;
rollback;
