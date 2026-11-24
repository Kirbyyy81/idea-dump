-- Isolated synthetic owners. No test data is committed.
begin;
create function pg_temp.check_split_edit(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('b0260000-0000-4000-8000-000000000001'),('b0260000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0260000-0000-4000-8000-000000000011','b0260000-0000-4000-8000-000000000001','Synthetic bank'),
 ('b0260000-0000-4000-8000-000000000012','b0260000-0000-4000-8000-000000000001','Synthetic wallet');
insert into public.dim_finance_categories(id,user_id,name) values
 ('b0260000-0000-4000-8000-000000000021','b0260000-0000-4000-8000-000000000001','Synthetic food'),
 ('b0260000-0000-4000-8000-000000000022','b0260000-0000-4000-8000-000000000001','Synthetic shopping');
insert into public.dim_finance_tags(id,user_id,name) values
 ('b0260000-0000-4000-8000-000000000031','b0260000-0000-4000-8000-000000000001','Synthetic trip'),
 ('b0260000-0000-4000-8000-000000000032','b0260000-0000-4000-8000-000000000002','Synthetic foreign');
insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,merchant,reference_number,notes,transaction_date,status)
values('b0260000-0000-4000-8000-000000000101','b0260000-0000-4000-8000-000000000001','b0260000-0000-4000-8000-000000000011',
 'b0260000-0000-4000-8000-000000000021','expense',30,'Synthetic original','OLD-30','Original note',(now() at time zone 'Asia/Kuala_Lumpur')::date-1,'confirmed');
set local role service_role;
do $$
declare u uuid:='b0260000-0000-4000-8000-000000000001'; payment uuid:='b0260000-0000-4000-8000-000000000101';
 context jsonb; previous jsonb; old_version text; b uuid; c uuid; frozen jsonb; yesterday date:=(now() at time zone 'Asia/Kuala_Lumpur')::date-1;
 input jsonb:=jsonb_build_object('p_source_id','b0260000-0000-4000-8000-000000000012','p_category_id','b0260000-0000-4000-8000-000000000022',
  'p_direction','income','p_amount',40,'p_currency','MYR','p_merchant','Synthetic edited','p_payee_name','Synthetic payer',
  'p_transaction_date',(now() at time zone 'Asia/Kuala_Lumpur')::date,'p_notes','Edited original note','p_reference_number','NEW-40',
  'p_tag_ids',jsonb_build_array('b0260000-0000-4000-8000-000000000031'),'p_foreign_amount','80.00','p_foreign_currency','TWD');
 parts jsonb:='[{"amount":"15.00","category_id":"b0260000-0000-4000-8000-000000000021","notes":"Meal","tag_ids":["b0260000-0000-4000-8000-000000000031"]},{"amount":"25.00","category_id":"b0260000-0000-4000-8000-000000000022","notes":"Gift","tag_ids":[]}]';
begin
 perform public.finance_save_transaction_split(u,payment,public.finance_get_transaction_split(u,payment)->>'version',
  '[{"amount":"10.00","category_id":"b0260000-0000-4000-8000-000000000021","notes":"Old meal","tag_ids":[]},{"amount":"20.00","category_id":null,"notes":null,"tag_ids":[]}]');
 context:=public.finance_get_split_transaction_edit(u,payment);
 old_version:=context->'split'->>'version';
 perform pg_temp.check_split_edit((context->'transaction'->>'amount')::numeric=30 and context->'transaction'->>'reference_number'='OLD-30'
  and (context->'transaction'->>'is_split')::boolean and jsonb_array_length(context->'split'->'parts')=2,'original and allocation snapshot');
 perform pg_temp.check_split_edit(public.finance_get_split_transaction_edit('b0260000-0000-4000-8000-000000000002',payment) is null,'foreign read denied');
 perform pg_temp.check_split_edit(not has_function_privilege('anon','public.finance_update_split_transaction(uuid,uuid,text,jsonb,jsonb)','execute')
  and not has_function_privilege('authenticated','public.finance_get_split_transaction_edit(uuid,uuid)','execute'),'server-only RPCs');
 begin
  perform public.finance_update_split_transaction('b0260000-0000-4000-8000-000000000002',payment,old_version,input,parts);
  raise exception 'foreign edit accepted'; exception when no_data_found then null;
 end;
 begin
  perform public.finance_update_split_transaction(u,payment,repeat('0',32),input,parts);
  raise exception 'stale version accepted'; exception when serialization_failure then null;
 end;
 begin
  perform public.finance_update_split_transaction(u,payment,old_version,input,jsonb_set(parts,'{0,amount}','"14.00"'));
  raise exception 'wrong total accepted'; exception when invalid_parameter_value then null;
 end;
 perform pg_temp.check_split_edit(public.finance_get_split_transaction_edit(u,payment)=context,'invalid total rolls back original, tags and all parts');
 begin
  perform public.finance_update_split_transaction(u,payment,old_version,input,jsonb_set(parts,'{0,tag_ids}','["b0260000-0000-4000-8000-000000000032"]'));
  raise exception 'foreign allocation tag accepted'; exception when invalid_parameter_value then null;
 end;
 perform pg_temp.check_split_edit(public.finance_get_split_transaction_edit(u,payment)=context,'invalid allocation rolls back ordinary editor changes');
 -- A due budget must close using the original split ledger before any edit.
 b:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),jsonb_build_object(
  'name','Synthetic split edit budget','amount','100.00','cycle_type','custom','custom_days',1,'start_date',yesterday,'time_zone','Asia/Kuala_Lumpur',
  'filter_logic','and','include_uncategorised',false,'source_ids','[]'::jsonb,'category_ids','[]'::jsonb),yesterday::timestamp at time zone 'Asia/Kuala_Lumpur');
 select id into c from public.finance_budget_cycles where budget_id=b;
 perform public.finance_update_split_transaction(u,payment,old_version,input,parts);
 previous:=context;
 context:=public.finance_get_split_transaction_edit(u,payment);
 select to_jsonb(x) into frozen from public.finance_budget_cycles x where id=c;
 perform pg_temp.check_split_edit(frozen->>'frozen_at' is not null and (frozen->>'expense')::numeric=30 and (frozen->>'income')::numeric=0,'freeze old totals before original and parts change');
 perform pg_temp.check_split_edit(context->'transaction'->>'source_id'='b0260000-0000-4000-8000-000000000012'
  and context->'transaction'->>'direction'='income' and (context->'transaction'->>'amount')::numeric=40
  and context->'transaction'->>'merchant'='Synthetic edited' and context->'transaction'->>'reference_number'='NEW-40'
  and context->'transaction'->'finance_payee'->>'name'='Synthetic payer' and context->'transaction'->>'notes'='Edited original note','normal fields saved');
 perform pg_temp.check_split_edit((context->'transaction'->>'foreign_amount')::numeric=80 and context->'transaction'->>'foreign_currency'='TWD'
  and jsonb_array_length(context->'transaction'->'tags')=1,'original foreign details and tags saved');
 perform pg_temp.check_split_edit(context->'split'->'parts'->0->>'id'=previous->'split'->'parts'->0->>'id'
  and context->'split'->'parts'->1->>'id'=previous->'split'->'parts'->1->>'id','allocation identity retained');
 perform pg_temp.check_split_edit((select count(*)=2 and sum(amount)=40 and bool_and(direction='income') and bool_and(source_id='b0260000-0000-4000-8000-000000000012'::uuid)
  from public.finance_ledger_entries where user_id=u),'only balanced allocations appear in ledger');
 perform pg_temp.check_split_edit((context->'split'->'parts'->0->>'amount')::numeric=15 and context->'split'->'parts'->0->>'notes'='Meal'
  and jsonb_array_length(context->'split'->'parts'->0->'tags')=1 and jsonb_array_length(context->'split'->'parts'->1->'tags')=0,'allocation fields saved independently');
 perform pg_temp.check_split_edit(public.finance_budget_detail(u,b)->'budget'->'current_cycle'->'metrics'->>'net_spending'='-40.00','open totals reflect new date, amount and direction');
 begin
  perform public.finance_update_split_transaction(u,payment,old_version,input,parts);
  raise exception 'old form overwrite accepted'; exception when serialization_failure then null;
 end;
 begin
  update public.finance_transactions set amount=1 where id=payment and user_id=u;
  raise exception 'direct unbalanced change accepted'; exception when check_violation then null;
 end;
 perform pg_temp.check_split_edit((select to_jsonb(x)=frozen from public.finance_budget_cycles x where id=c),'frozen row unchanged by retries');
 perform finance_private.check_split_total(payment,u);
end $$;
reset role;
set constraints all immediate;
rollback;
