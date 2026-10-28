-- Synthetic owners only. Lifecycle, matching, ownership and history roll back.
begin;
create function pg_temp.check_tag_budget(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('b0220000-0000-4000-8000-000000000001'),('b0220000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0220000-0000-4000-8000-000000000011','b0220000-0000-4000-8000-000000000001','Synthetic bank');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0220000-0000-4000-8000-000000000021','b0220000-0000-4000-8000-000000000001','Synthetic food'),
 ('b0220000-0000-4000-8000-000000000022','b0220000-0000-4000-8000-000000000001','Synthetic shopping');
insert into public.dim_finance_tags(id,user_id,name) values
 ('b0220000-0000-4000-8000-000000000041','b0220000-0000-4000-8000-000000000001','Synthetic trip'),
 ('b0220000-0000-4000-8000-000000000042','b0220000-0000-4000-8000-000000000001','Synthetic event'),
 ('b0220000-0000-4000-8000-000000000043','b0220000-0000-4000-8000-000000000002','Other owner tag');
insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,transaction_date,status) values
 ('b0220000-0000-4000-8000-000000000031','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011','b0220000-0000-4000-8000-000000000021','expense',40,current_date-100,'confirmed'),
 ('b0220000-0000-4000-8000-000000000032','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011','b0220000-0000-4000-8000-000000000022','expense',20,current_date,'confirmed'),
 ('b0220000-0000-4000-8000-000000000033','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011','b0220000-0000-4000-8000-000000000021','income',5,current_date,'confirmed'),
 ('b0220000-0000-4000-8000-000000000034','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011','b0220000-0000-4000-8000-000000000021','expense',10,current_date,'confirmed'),
 ('b0220000-0000-4000-8000-000000000035','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011',null,'expense',9,current_date,'confirmed'),
 ('b0220000-0000-4000-8000-000000000036','b0220000-0000-4000-8000-000000000001','b0220000-0000-4000-8000-000000000011',null,'expense',999,current_date,'review');
insert into public.finance_transaction_tags(transaction_id,tag_id,user_id)
select tx::uuid,tag::uuid,'b0220000-0000-4000-8000-000000000001'::uuid from (values
 ('b0220000-0000-4000-8000-000000000031','b0220000-0000-4000-8000-000000000041'),
 ('b0220000-0000-4000-8000-000000000032','b0220000-0000-4000-8000-000000000041'),
 ('b0220000-0000-4000-8000-000000000032','b0220000-0000-4000-8000-000000000042'),
 ('b0220000-0000-4000-8000-000000000033','b0220000-0000-4000-8000-000000000041'),
 ('b0220000-0000-4000-8000-000000000035','b0220000-0000-4000-8000-000000000042'),
 ('b0220000-0000-4000-8000-000000000036','b0220000-0000-4000-8000-000000000041')) v(tx,tag);
set local role service_role;
do $$
declare
 u uuid:='b0220000-0000-4000-8000-000000000001'; b uuid; extra uuid; request uuid:=gen_random_uuid();
 config jsonb; summary jsonb; cycle uuid; frozen jsonb; before_count integer; report_month text:=to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM');
begin
 config:=jsonb_build_object('name','Synthetic one-time','amount','100.00','cycle_type','one_time','start_date',null,'custom_days',null,'anchor_day',null,
  'time_zone','Asia/Kuala_Lumpur','filter_logic','and','include_uncategorised',false,'source_ids','[]'::jsonb,'category_ids','[]'::jsonb,
  'tag_ids','["b0220000-0000-4000-8000-000000000041"]'::jsonb);
 b:=public.finance_budget_mutate(u,'create',null,null,request,config);
 perform pg_temp.check_tag_budget(b=public.finance_budget_mutate(u,'create',null,null,request,config),'exact replay');
 summary:=public.finance_budget_summary(u,b);
 cycle:=(summary->'current_cycle'->>'id')::uuid;
 perform pg_temp.check_tag_budget(summary->>'state'='active' and summary->'configuration'->>'start_date' is null,'one-time has no start date');
 perform pg_temp.check_tag_budget(summary->'current_cycle'->>'start_date' is null and summary->'current_cycle'->>'end_date' is null,'no fabricated cycle dates');
 perform pg_temp.check_tag_budget((summary->'current_cycle'->'metrics'->>'net_spending')::numeric=55,'tag-only spans categories, includes older transactions and offsets income');
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_list(u,'active')->'data')=1,'one-time appears in active list');
 perform public.finance_budget_reconcile(u,b,now()+interval '10 years');
 perform pg_temp.check_tag_budget((select count(*)=1 from public.finance_budget_cycles where budget_id=b),'one-time never recurs');
 for i in 1..4 loop
  extra:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||jsonb_build_object('name','Synthetic ongoing '||i));
 end loop;
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_dashboard(u,report_month))=5,'all active one-time cards remain visible beyond top three');
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_dashboard(u,'2020-01'))=5,'one-time is independent of reporting month');
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_dashboard(u,'9998-01'))=5,'one-time is independent of future reporting month');
 config:=config||'{"tag_ids":["b0220000-0000-4000-8000-000000000041","b0220000-0000-4000-8000-000000000042"]}';
 perform public.finance_budget_mutate(u,'update',b,1,null,config);
 summary:=public.finance_budget_detail(u,b);
 perform pg_temp.check_tag_budget((summary->'budget'->'current_cycle'->'metrics'->>'net_spending')::numeric=64 and (summary->'transactions'->>'total')::integer=4,'any selected tag, no duplicate counting, no unconfirmed rows');
 perform public.finance_budget_mutate(u,'update',b,2,null,config||'{"category_ids":["b0220000-0000-4000-8000-000000000021"]}');
 perform pg_temp.check_tag_budget((public.finance_budget_summary(u,b)->'current_cycle'->'metrics'->>'net_spending')::numeric=35,'AND matches all configured dimensions');
 perform public.finance_budget_mutate(u,'update',b,3,null,config||'{"category_ids":["b0220000-0000-4000-8000-000000000021"],"filter_logic":"or"}');
 perform pg_temp.check_tag_budget((public.finance_budget_summary(u,b)->'current_cycle'->'metrics'->>'net_spending')::numeric=74,'OR matches any configured dimension once');
 perform public.finance_budget_mutate(u,'update',b,4,null,config-'tag_ids');
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_configuration(u,b)->'tag_ids')=2,'older clients preserve omitted tags');
 begin
  perform public.finance_budget_mutate(u,'update',b,5,null,config||'{"tag_ids":["b0220000-0000-4000-8000-000000000043"]}');
  raise exception 'foreign tag accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.finance_budget_mutate('b0220000-0000-4000-8000-000000000002','update',b,5,null,config);
  raise exception 'foreign budget accepted';
 exception when no_data_found then null; end;
 begin
  perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"Invalid dates","start_date":"2026-01-01"}');
  raise exception 'dated one-time accepted';
 exception when invalid_parameter_value then null; end;
 perform public.finance_save_tag(u,'b0220000-0000-4000-8000-000000000042',null,true);
 perform public.finance_budget_mutate(u,'update',b,5,null,config);
 begin
  perform public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||'{"name":"New archived selection"}');
  raise exception 'new archived selection accepted';
 exception when invalid_parameter_value then null; end;
 perform public.finance_budget_mutate(u,'archive',b,6);
 select to_jsonb(c) into frozen from public.finance_budget_cycles c where id=cycle;
 perform pg_temp.check_tag_budget((frozen->>'net_spending')::numeric=64,'archive freezes the cumulative amount');
 perform pg_temp.check_tag_budget(jsonb_array_length(public.finance_budget_dashboard(u,report_month))=4,'archive removes the one-time dashboard card');
 perform public.finance_bulk_transaction_tags(u,array['b0220000-0000-4000-8000-000000000031']::uuid[],array['b0220000-0000-4000-8000-000000000041']::uuid[],'remove');
 perform pg_temp.check_tag_budget(frozen=(select to_jsonb(c) from public.finance_budget_cycles c where id=cycle),'tag changes never rewrite frozen history');
 begin
  update public.finance_budget_cycles set expense=0 where id=cycle and user_id=u;
  raise exception 'frozen total changed';
 exception when check_violation then null; end;
 delete from public.dim_finance_tags where id='b0220000-0000-4000-8000-000000000042' and user_id=u;
 perform pg_temp.check_tag_budget(exists(select 1 from jsonb_array_elements(public.finance_budget_configuration(u,b)->'tags') x where x->>'id' is null),'deleted archived selections require explicit repair');
 begin
  perform public.finance_budget_mutate(u,'restore',b,7,null,config);
  raise exception 'missing tag restored';
 exception when invalid_parameter_value then null; end;
 config:=config||'{"tag_ids":["b0220000-0000-4000-8000-000000000041"]}';
 perform public.finance_budget_mutate(u,'restore',b,7,null,config);
 summary:=public.finance_budget_summary(u,b);
 perform pg_temp.check_tag_budget((summary->'current_cycle'->'metrics'->>'net_spending')::numeric=15,'restore resumes all matching transactions, not a new date window');
 perform pg_temp.check_tag_budget((select count(*)=2 from public.finance_budget_cycles where budget_id=b),'restore retains the frozen archive');
 perform public.finance_budget_mutate(u,'update',b,8,null,config||jsonb_build_object('cycle_type','weekly','start_date',(now() at time zone 'Asia/Kuala_Lumpur')::date));
 perform pg_temp.check_tag_budget(public.finance_budget_summary(u,b)->'current_cycle'->>'start_date' is not null,'convert one-time to recurring');
 perform public.finance_budget_mutate(u,'update',b,9,null,config);
 perform pg_temp.check_tag_budget(public.finance_budget_summary(u,b)->'current_cycle'->>'end_date' is null,'convert recurring to one-time');
 begin
  delete from public.dim_finance_tags where id='b0220000-0000-4000-8000-000000000041' and user_id=u;
  raise exception 'active budget tag deleted';
 exception when foreign_key_violation then null; end;
 -- A tag removed after a recurring boundary must still count in the frozen cycle.
 update public.finance_transactions set transaction_date=(now() at time zone 'Asia/Kuala_Lumpur')::date-1
 where id='b0220000-0000-4000-8000-000000000032' and user_id=u;
 extra:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),config||jsonb_build_object(
  'name','Synthetic due tagged budget','cycle_type','weekly','start_date',(now() at time zone 'Asia/Kuala_Lumpur')::date));
 update public.finance_budget_cycles set start_date=(now() at time zone 'Asia/Kuala_Lumpur')::date-7,
  end_date=(now() at time zone 'Asia/Kuala_Lumpur')::date where budget_id=extra and frozen_at is null;
 select id into cycle from public.finance_budget_cycles where budget_id=extra and frozen_at is null;
 perform public.finance_bulk_transaction_tags(u,array['b0220000-0000-4000-8000-000000000032']::uuid[],
  array['b0220000-0000-4000-8000-000000000041']::uuid[],'remove');
 perform pg_temp.check_tag_budget((select frozen_at is not null and net_spending=20 from public.finance_budget_cycles where id=cycle),
  'close due tagged cycles before changing tag membership');
end $$;
reset role;
-- Retention cascades may remove synthetic owners and frozen records together.
delete from auth.users where id='b0220000-0000-4000-8000-000000000001';
rollback;
