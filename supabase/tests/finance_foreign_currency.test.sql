\set ON_ERROR_STOP on
begin;
create function pg_temp.check_fx(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('69000000-0000-4000-8000-000000000001'),('69000000-0000-4000-8000-000000000002');
insert into public.bridge_user_module_overrides(user_id,module_id,effect)
select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m
where u.id in ('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000002') and m.modules='finance';
insert into public.dim_finance_sources(id,user_id,name)
values('69000000-0000-4000-8000-000000000011','69000000-0000-4000-8000-000000000001','Synthetic Ryt');
insert into public.companion_devices(id,user_id,token_hash,label)
values('69000000-0000-4000-8000-000000000021','69000000-0000-4000-8000-000000000001',repeat('9',64),'Synthetic phone');
insert into public.dim_finance_tags(id,user_id,name,is_archived,created_at) values
('69000000-0000-4000-8000-000000000031','69000000-0000-4000-8000-000000000001','Travel - Old trip',false,'2026-01-01'),
('69000000-0000-4000-8000-000000000032','69000000-0000-4000-8000-000000000001','travel - New trip',false,'2026-01-02'),
('69000000-0000-4000-8000-000000000033','69000000-0000-4000-8000-000000000001','Travel - Archived',true,'2026-01-03'),
('69000000-0000-4000-8000-000000000034','69000000-0000-4000-8000-000000000001','Travel insurance',false,'2026-01-04'),
('69000000-0000-4000-8000-000000000035','69000000-0000-4000-8000-000000000002','Travel - Other owner',false,'2026-01-05');

create function pg_temp.fx_payload(p_amount numeric) returns jsonb language sql as $$
select jsonb_build_object('source_id','69000000-0000-4000-8000-000000000011','amount',p_amount,'currency','MYR',
 'direction','expense','merchant','Synthetic Store','payee_name',null,'category_id',null,'reference_number',null,'notes',null,
 'transaction_date',(now() at time zone 'Asia/Kuala_Lumpur')::date,'foreign_amount','1600.1254','foreign_currency','TWD',
 'notification_extraction',jsonb_build_object('version',1,'conflicts','[]'::jsonb,'date_provenance','posted_at','fields',
  (select jsonb_object_agg(field,jsonb_build_object('pattern_id','52000000-0000-4000-8000-000000000017','revision',1,'learned',false))
   from unnest(array['amount','merchant','direction','foreign_amount','foreign_currency']) field)))
$$;
create function pg_temp.fx_parsed(p jsonb) returns jsonb language sql as $$
select jsonb_build_object('status','review','date_provenance','posted_at','payload',p,'duplicate_outcome','none','duplicate_score',0,'duplicate_signals','[]'::jsonb)
$$;
create function pg_temp.fx_accept(n int,p jsonb) returns jsonb language sql as $$
select public.finance_accept_notification_v2('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000021',
 jsonb_build_object('client_event_id','69000000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'source_id','69000000-0000-4000-8000-000000000011','source_package','my.rytbank.app',
 'notification_key_hash',repeat('9',64),'captured_at',now(),'notification',
 jsonb_build_object('title','Card payment completed','text','RM200.76 (TWD1,600.1254) paid at Synthetic Store using your Main Account.','posted_at',now())),
 repeat('9',64),pg_temp.fx_parsed(p))
$$;
create function pg_temp.fail_fx_tag() returns trigger language plpgsql as $$
begin
 if current_setting('test.fail_fx_tag',true)='on' then raise exception 'synthetic tag failure'; end if;
 return new;
end $$;
create trigger test_fail_fx_tag before insert on public.finance_transaction_tags for each row execute function pg_temp.fail_fx_tag();

set local role service_role;
do $$
declare
 u uuid:='69000000-0000-4000-8000-000000000001'; s uuid:='69000000-0000-4000-8000-000000000011';
 old_trip uuid:='69000000-0000-4000-8000-000000000031'; latest uuid:='69000000-0000-4000-8000-000000000032';
 r jsonb; req jsonb; review jsonb; learning jsonb; c uuid; i uuid; t uuid; manual uuid; first_import uuid; budget uuid;
begin
 perform public.finance_save_tag(u,old_trip,'Travel - Renamed old trip');
 budget:=public.finance_budget_mutate(u,'create',null,null,gen_random_uuid(),
  jsonb_build_object('name','Synthetic travel budget','amount','1000.00','cycle_type','one_time',
   'time_zone','Asia/Kuala_Lumpur','filter_logic','and','include_uncategorised',false,'tag_ids',jsonb_build_array(latest),
   'source_ids','[]'::jsonb,'category_ids','[]'::jsonb));
 r:=pg_temp.fx_accept(101,pg_temp.fx_payload(200.76));
 i:=(r->>'intake_item_id')::uuid;
 perform pg_temp.check_fx(r->>'status'='completed','valid pair can auto-confirm');
 select id into first_import from public.finance_transactions where intake_item_id=i and user_id=u;
 perform pg_temp.check_fx((select amount=200.76 and currency='MYR' and foreign_amount=1600.1254 and foreign_currency='TWD'
  from public.finance_transactions where id=first_import),'atomic exact ledger pair and unchanged MYR charge');
 perform pg_temp.check_fx((select array_agg(tag_id)=array[latest] from public.finance_transaction_tags where transaction_id=first_import),'newest unarchived owner travel tag wins even after renaming an older one');
 perform pg_temp.check_fx((select sum(amount)=200.76 from public.finance_tagged_transactions(u,array[old_trip,latest],'include')),'tagged accounting uses the MYR charge once');
 perform pg_temp.check_fx((public.finance_budget_summary(u,budget)->'current_cycle'->'metrics'->>'net_spending')::numeric=200.76,
  'travel budget uses the MYR charge once');
 perform pg_temp.check_fx((select body is null and raw_deleted_at is not null from public.finance_notification_events where intake_item_id=i),'successful confirmation deletes raw text');
 perform pg_temp.check_fx(not exists(select 1 from public.finance_notification_patterns where evidence_transaction_id=first_import),'auto-confirm does not teach');

 perform public.finance_save_tag(u,latest,null,true);
 perform pg_temp.check_fx(pg_temp.fx_accept(101,pg_temp.fx_payload(200.76))->>'replayed'='true','upload replays');
 perform pg_temp.check_fx((select array_agg(tag_id)=array[latest] from public.finance_transaction_tags where transaction_id=first_import),'replays preserve the original trip');
 r:=pg_temp.fx_accept(102,pg_temp.fx_payload(54)||'{"foreign_currency":"MYR"}');
 i:=(r->>'intake_item_id')::uuid; c:=(r->>'candidate_id')::uuid;
 perform pg_temp.check_fx(r->>'status'='review' and not exists(select 1 from public.finance_transactions where intake_item_id=i),'malformed pair cannot produce a MYR-only ledger row');
 r:=public.finance_retry_notification_v1(u,c,repeat('9',64),pg_temp.fx_parsed(pg_temp.fx_payload(54)));
 t:=(r->'transaction'->>'id')::uuid;
 perform pg_temp.check_fx(r->>'confirmed'='true' and (r->'transaction'->>'foreign_amount')::numeric=1600.1254,'retry saves pair');
 perform pg_temp.check_fx((select array_agg(tag_id)=array[old_trip] from public.finance_transaction_tags where transaction_id=t),'retry skips archived trip');

 req:=jsonb_build_object('p_source_id',s,'p_direction','expense','p_amount',20,'p_merchant','Synthetic manual',
  'p_transaction_date',(now() at time zone 'Asia/Kuala_Lumpur')::date,'p_currency','MYR',
  'p_manual_idempotency_key','69000000-0000-4000-8000-000000000041','p_tag_ids',jsonb_build_array(old_trip),
  'p_foreign_amount','999999999999.1234','p_foreign_currency','JPY');
 select id into manual from public.finance_save_tagged_transaction(u,req);
 perform pg_temp.check_fx((select foreign_amount=999999999999.1234 from public.finance_transactions where id=manual),'exact decimal stored');
 perform pg_temp.check_fx((select id=manual from public.finance_save_tagged_transaction(u,req)),'matching manual replay');
 begin
  perform public.finance_save_tagged_transaction(u,req||'{"p_foreign_amount":"30"}');
  raise exception 'foreign replay conflict accepted';
 exception when unique_violation then null; end;
 begin
  perform public.finance_save_tagged_transaction(u,req||'{"p_foreign_amount":"1.23456"}',manual);
  raise exception 'excess precision accepted';
 exception when invalid_parameter_value then null; end;
 perform public.finance_save_tagged_transaction(u,(req-'p_foreign_amount'-'p_foreign_currency')||'{"p_tag_ids":[]}',manual);
 perform pg_temp.check_fx((select foreign_amount=999999999999.1234 from public.finance_transactions where id=manual)
  and not exists(select 1 from public.finance_transaction_tags where transaction_id=manual),'hidden pair preserved when removing tag');
 perform public.finance_save_tagged_transaction(u,req||'{"p_foreign_amount":null,"p_foreign_currency":null}',manual);
 perform pg_temp.check_fx((select foreign_amount is null and foreign_currency is null from public.finance_transactions where id=manual),'explicitly clears both fields');

 r:=pg_temp.fx_accept(103,pg_temp.fx_payload(37)||'{"amount":null}');
 c:=(r->>'candidate_id')::uuid; i:=(r->>'intake_item_id')::uuid;
 review:=(req-'p_tag_ids')||'{"p_confirmation_mode":"manual","p_amount":37,"p_merchant":"Synthetic review","p_foreign_amount":"42.1234","p_foreign_currency":"USD"}';
 learning:=jsonb_build_object('format_key','synthetic-fx','name','Synthetic foreign format','definition',
  (select definition from public.finance_notification_patterns where format_key='ryt-foreign-card-payment'));
 perform set_config('test.fail_fx_tag','on',true);
 begin
  perform public.finance_confirm_notification_v1(u,c,repeat('9',64),review,learning);
  raise exception 'expected a tag write failure';
 exception when raise_exception then if sqlerrm<>'synthetic tag failure' then raise; end if; end;
 perform pg_temp.check_fx((select body is not null from public.finance_notification_events where intake_item_id=i)
  and not exists(select 1 from public.finance_transactions where intake_item_id=i)
  and not exists(select 1 from public.finance_notification_patterns where user_id=u and format_key='synthetic-fx'),'failed tag write rolls back transaction, raw cleanup and learning');
 perform set_config('test.fail_fx_tag','off',true);
 r:=public.finance_confirm_notification_v1(u,c,repeat('9',64),review,learning);
 t:=(r->'transaction'->>'id')::uuid;
 perform pg_temp.check_fx((select foreign_amount=42.1234 and foreign_currency='USD' from public.finance_transactions where id=t)
  and exists(select 1 from public.finance_transaction_tags where transaction_id=t and tag_id=old_trip),'manual notification confirmation saves and tags');
 perform pg_temp.check_fx(exists(select 1 from public.finance_notification_patterns where evidence_transaction_id=t and evidence_valid),'learned evidence is current after the pair is saved');
 perform public.finance_confirm_review_with_foreign(u,c,review||'{"p_foreign_amount":"999"}');
 perform pg_temp.check_fx((select foreign_amount=42.1234 from public.finance_transactions where id=t),'accepted replay is read-only');
 perform public.finance_save_tagged_transaction(u,review||'{"p_foreign_amount":"42"}',t);
 perform pg_temp.check_fx((select not evidence_valid from public.finance_notification_patterns where evidence_transaction_id=t),'foreign correction invalidates supporting evidence');
 perform pg_temp.check_fx((select array_agg(tag_id)=array[old_trip] from public.finance_transaction_tags where transaction_id=t),'foreign edit does not reassign tags');

 r:=pg_temp.fx_accept(104,pg_temp.fx_payload(37));
 c:=(r->>'candidate_id')::uuid;
 perform pg_temp.check_fx(r->>'status'='review','MYR duplicate remains in review even with a different foreign amount');
 perform public.finance_link_candidate_v1(u,c,t,(select updated_at from public.finance_transactions where id=t),'{}');
 perform pg_temp.check_fx((select foreign_amount=42 and foreign_currency='USD' from public.finance_transactions where id=t)
  and (select array_agg(tag_id)=array[old_trip] from public.finance_transaction_tags where transaction_id=t),
  'linking duplicate evidence preserves the existing pair and trip');

 perform public.finance_save_tag(u,old_trip,null,true);
 insert into public.finance_intake_items(user_id,source,status) values(u,'screenshot','review') returning id into i;
 insert into public.finance_candidate_transactions(user_id,intake_item_id,payload)
 values(u,i,pg_temp.fx_payload(79)-'foreign_amount'-'foreign_currency'-'notification_extraction') returning id into c;
 begin
  perform public.finance_confirm_review_with_foreign('69000000-0000-4000-8000-000000000002',c,review);
  raise exception 'cross-owner confirmation accepted';
 exception when no_data_found then null; end;
 r:=public.finance_confirm_review_with_foreign(u,c,review||'{"p_amount":79,"p_merchant":"Synthetic screenshot"}');
 t:=(r->'transaction'->>'id')::uuid;
 perform pg_temp.check_fx(r->>'confirmed'='true' and (select amount=79 and foreign_currency='USD' from public.finance_transactions where id=t)
  and not exists(select 1 from public.finance_transaction_tags where transaction_id=t),'screenshot review can save a pair with no eligible travel tag');
end $$;
reset role;
select pg_temp.check_fx(not has_function_privilege('authenticated','public.finance_confirm_review_with_foreign(uuid,uuid,jsonb)','EXECUTE'),'new RPC is server only');
rollback;
