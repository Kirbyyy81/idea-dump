\set ON_ERROR_STOP on
begin;
create function pg_temp.check_link(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('31000000-0000-4000-8000-000000000001'),('31000000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
('31000000-0000-4000-8000-000000000011','31000000-0000-4000-8000-000000000001','Ryt'),
('31000000-0000-4000-8000-000000000012','31000000-0000-4000-8000-000000000002','Other bank');
insert into public.dim_finance_categories(id,user_id,name) values
('31000000-0000-4000-8000-000000000021','31000000-0000-4000-8000-000000000001','Food');
create function pg_temp.link_candidate(owner_id uuid) returns uuid language plpgsql as $$
declare i uuid; c uuid;
begin
 insert into public.finance_intake_items(user_id,source,status,received_at,ocr_text,ocr_normalized_text)
 values(owner_id,'screenshot','review',now(),'Synthetic receipt reference REF123','Synthetic receipt reference REF123') returning id into i;
 insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,status)
 values(owner_id,i,'{"reference_number":"REF123","merchant":"New cafe"}','pending') returning id into c;
 return c;
end $$;
set local role service_role;
do $$
declare
 u uuid:='31000000-0000-4000-8000-000000000001';
 other_u uuid:='31000000-0000-4000-8000-000000000002';
 t public.finance_transactions; other_t public.finance_transactions;
 c uuid; c2 uuid; other_c uuid; i uuid; result jsonb; replay jsonb; revision timestamptz; change jsonb;
begin
 t:=public.finance_create_manual_transaction_v2(u,'31000000-0000-4000-8000-000000000011',null,'expense',4,'Original cafe',null,current_date,'Existing note','MYR',null,null);
 other_t:=public.finance_create_manual_transaction_v2(other_u,'31000000-0000-4000-8000-000000000012',null,'expense',4,null,null,current_date,null,'MYR',null,null);
 c:=pg_temp.link_candidate(u); revision:=t.updated_at;
 result:=public.finance_link_candidate_v1(u,c,t.id,revision,'{"reference_number":" ref123 "}');
 select * into t from public.finance_transactions where id=t.id;
 perform pg_temp.check_link(t.reference_number='REF123' and t.merchant='Original cafe' and t.notes='Existing note' and t.amount=4,'only selected gap filled');
 perform pg_temp.check_link((select count(*)=1 from public.finance_transactions where user_id=u),'one ledger row');
 perform pg_temp.check_link((select status='duplicate' and payload->>'reference_number'='REF123' from public.finance_candidate_transactions where id=c),'candidate linked without altering parser evidence');
 perform pg_temp.check_link((select count(*)=1 from public.finance_processing_events where user_id=u and event_type='duplicate_linked'),'one provenance event');
 perform pg_temp.check_link((select detail->'changes'->'reference_number'->>'after'='REF123' from public.finance_processing_events where user_id=u and event_type='duplicate_linked'),'reviewed reference provenance');
 replay:=public.finance_link_candidate_v1(u,c,t.id,revision,'{"reference_number":"OTHER"}');
 perform pg_temp.check_link(replay=result and (select reference_number='REF123' from public.finance_transactions where id=t.id),'retry does not reapply edits');
 perform pg_temp.check_link((select count(*)=1 from public.finance_processing_events where user_id=u and event_type='duplicate_linked'),'retry does not duplicate provenance');
 select intake_item_id into i from public.finance_candidate_transactions where id=c;
 perform pg_temp.check_link((select ocr_text='Synthetic receipt reference REF123' from public.finance_intake_items where id=i),'OCR evidence retained');
 perform pg_temp.check_link(not exists(select 1 from public.finance_corrections where user_id=u),'linking does not invent learning corrections');
 c2:=pg_temp.link_candidate(u);
 result:=public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,jsonb_build_object('merchant','Reviewed cafe','amount',5,'direction','income','transaction_date',(current_date-1)::text,'category_id','31000000-0000-4000-8000-000000000021','payee_name','Alex'));
 select * into t from public.finance_transactions where id=t.id;
 perform pg_temp.check_link(t.merchant='Reviewed cafe' and t.amount=5 and t.direction='income' and t.transaction_date=current_date-1 and t.category_id is not null and t.payee_id is not null,'explicit conflicts and other gaps applied');
 perform pg_temp.check_link(t.reference_number='REF123' and t.notes='Existing note','unselected values retained');
 c2:=pg_temp.link_candidate(u);
 result:=public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,'{"payee_name":"ALEX"}');
 perform pg_temp.check_link(result->'applied_fields'='[]'::jsonb,'canonical payee does not record a false change');
 c2:=pg_temp.link_candidate(u); other_c:=pg_temp.link_candidate(other_u);
 begin
  perform public.finance_link_candidate_v1(u,c2,other_t.id,other_t.updated_at,'{}');
  raise exception 'other owner target accepted';
 exception when no_data_found then null; end;
 begin
  perform public.finance_link_candidate_v1(u,other_c,t.id,t.updated_at,'{}');
  raise exception 'other owner candidate accepted';
 exception when no_data_found then null; end;
 begin
  perform public.finance_link_candidate_v1(u,c2,t.id,revision,'{"notes":"stale"}');
  raise exception 'stale target accepted';
 exception when serialization_failure then null; end;
 for change in select value from jsonb_array_elements('[{"amount":1.001},{"amount":0},{"notes":null},{"source":"screenshot"},{"user_id":"bad"},{"reference_number":123}]') loop
  begin
   perform public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,change);
   raise exception 'invalid change accepted: %',change;
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,'{"source_id":"31000000-0000-4000-8000-000000000012","reference_number":"WRONG"}');
  raise exception 'cross-owner dimension accepted';
 exception when foreign_key_violation then null; end;
 perform pg_temp.check_link((select reference_number='REF123' from public.finance_transactions where id=t.id) and (select status='pending' from public.finance_candidate_transactions where id=c2),'failure rolls back update and link');
 perform public.finance_reject_candidate(u,c2);
 begin
  perform public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,'{}');
  raise exception 'rejected candidate accepted';
 exception when check_violation then null; end;
 c2:=pg_temp.link_candidate(u);
 perform public.finance_link_candidate_v1(u,c2,t.id,t.updated_at,'{}');
 perform pg_temp.check_link((select updated_at=t.updated_at from public.finance_transactions where id=t.id),'link-only preserves ledger values and version');
end $$;
reset role;
select pg_temp.check_link(not has_function_privilege('authenticated','public.finance_link_candidate_v1(uuid,uuid,uuid,timestamptz,jsonb)','EXECUTE'),'authenticated cannot call RPC');
select pg_temp.check_link(not has_function_privilege('anon','public.finance_link_candidate_v1(uuid,uuid,uuid,timestamptz,jsonb)','EXECUTE'),'anon cannot call RPC');
rollback;
