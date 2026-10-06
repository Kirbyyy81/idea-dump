\set ON_ERROR_STOP on
begin;
create function pg_temp.check_companion(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('21000000-0000-4000-8000-000000000001'),('21000000-0000-4000-8000-000000000002');
insert into public.dim_modules(modules,name,path,enabled,is_always_allowed) values('finance','Finance','/finance',true,false)
on conflict(modules) do update set enabled=true,is_always_allowed=false;
insert into public.bridge_user_module_overrides(user_id,module_id,effect)
select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m
where u.id in ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002') and m.modules='finance';
insert into public.dim_finance_sources(id,user_id,name) values
('21000000-0000-4000-8000-000000000011','21000000-0000-4000-8000-000000000001','TNG'),
('21000000-0000-4000-8000-000000000012','21000000-0000-4000-8000-000000000002','Other owner');
insert into public.companion_devices(id,user_id,token_hash,label) values
('21000000-0000-4000-8000-000000000021','21000000-0000-4000-8000-000000000001',repeat('a',64),'Android 13'),
('21000000-0000-4000-8000-000000000022','21000000-0000-4000-8000-000000000002',repeat('b',64),'Android 16');
create function pg_temp.notification_event(n int) returns jsonb language sql as $$
select jsonb_build_object('client_event_id','21000000-0000-4000-8000-'||lpad(n::text,12,'0'),
'source_id','21000000-0000-4000-8000-000000000011','source_package','my.com.tngdigital.ewallet',
'notification_key_hash',repeat('c',64),'captured_at','2026-09-25T01:00:00Z',
'notification',jsonb_build_object('title','TNG','text','Alex has transferred RM 25.90 to you. Tap here to check the transaction details','subtext',null,'posted_at','2026-09-25T01:00:00Z'))
$$;
create function pg_temp.notification_parse() returns jsonb language sql as $$
select jsonb_build_object('status','review','date_provenance','posted_at','payload',
jsonb_build_object('source_id','21000000-0000-4000-8000-000000000011','amount',25.90,'direction','income','currency','MYR',
'transaction_date',current_date::text,'payee_name','Alex','matched_rule_names','[]'::jsonb))
$$;
create function pg_temp.accept_notification(n int) returns jsonb language sql as $$
select public.finance_accept_notification_v1('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000021',
pg_temp.notification_event(n),md5(n::text)||md5(n::text),pg_temp.notification_parse())
$$;

set local role service_role;
do $$
declare
 u uuid:='21000000-0000-4000-8000-000000000001';
 s uuid:='21000000-0000-4000-8000-000000000011';
 r jsonb; c uuid; i uuid; t uuid; p public.finance_notification_patterns; before_count int; rev int;
 config jsonb:='{"format_key":"tng-incoming","name":"Reviewed transfer","definition":{"version":1,"parts":[{"kind":"text","field":"payee_name"}," has transferred ",{"kind":"amount","field":"amount"}," to you"],"direction":"income","trailing_sentence":true}}';
 args jsonb;
begin
 perform pg_temp.check_companion((select count(*)=15 from public.finance_notification_patterns_for_user_v1(u,s)),'starter patterns available');
 perform pg_temp.check_companion(not exists(select 1 from public.finance_notification_patterns_for_user_v1(u,'21000000-0000-4000-8000-000000000012')),'source ownership');
 args:=jsonb_build_object('p_source_id',s,'p_category_id',null,'p_direction','income','p_amount',25.9,'p_merchant',null,'p_payee_name','Alex',
  'p_transaction_date',current_date,'p_notes',null,'p_currency','MYR','p_reference_number',null,'p_allow_duplicate',true,
  'p_duplicate_override_reason','Distinct synthetic review','p_confirmation_mode','manual');
 r:=pg_temp.accept_notification(301); c:=(r->>'candidate_id')::uuid; i:=(r->>'intake_item_id')::uuid;
 begin
  perform public.finance_confirm_notification_v1(u,c,repeat('z',64),args,config);
  raise exception 'bad digest accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.finance_confirm_notification_v1(u,c,md5('301')||md5('301'),args,jsonb_set(config,'{definition}','{"version":1,"parts":[{"kind":"evil"}],"regex":".*"}'));
  raise exception 'unsafe pattern accepted';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.check_companion((select status='pending' from public.finance_candidate_transactions where id=c),'invalid learning rolls back confirmation');
 perform pg_temp.check_companion((select body is not null from public.finance_notification_events where intake_item_id=i),'failed confirmation preserves raw text');
 r:=public.finance_confirm_notification_v1(u,c,md5('301')||md5('301'),args,config);
 t:=(r->'transaction'->>'id')::uuid;
 select * into p from public.finance_notification_patterns where user_id=u;
 perform pg_temp.check_companion(p.is_active and p.evidence_valid and p.origin='learned','active after one review');
 perform pg_temp.check_companion((select count(*)=1 from public.finance_notification_learning_reviews where user_id=u),'one evidence entry');
 perform pg_temp.check_companion((select body is null and title is null from public.finance_notification_events where intake_item_id=i),'raw text deleted');
 perform public.finance_confirm_notification_v1(u,c,null,args,config);
 perform pg_temp.check_companion((select count(*)=1 from public.finance_notification_learning_reviews where user_id=u),'confirmation replay does not retrain');
 perform pg_temp.check_companion((select revision=p.revision from public.finance_notification_patterns where id=p.id),'replay preserves version');
 p:=public.finance_set_notification_pattern_v1(u,s,p.id,false,p.revision);
 r:=pg_temp.accept_notification(302); c:=(r->>'candidate_id')::uuid;
 perform public.finance_confirm_notification_v1(u,c,md5('302')||md5('302'),args,config);
 select * into p from public.finance_notification_patterns where id=p.id;
 perform pg_temp.check_companion(not p.is_active and p.evidence_valid,'learning cannot re-enable disabled pattern');
 p:=public.finance_set_notification_pattern_v1(u,s,p.id,true,p.revision);
 rev:=p.revision;
 update public.finance_transactions set category_id=null,notes='A note' where id=p.evidence_transaction_id;
 perform pg_temp.check_companion((select revision=rev from public.finance_notification_patterns where id=p.id),'notes and categories do not invalidate extraction');
 update public.finance_transactions set amount=26 where id=p.evidence_transaction_id;
 perform pg_temp.check_companion((select not evidence_valid from public.finance_notification_patterns where id=p.id),'edited evidence invalidated');
 begin
  perform public.finance_set_notification_pattern_v1(u,s,p.id,true,rev);
  raise exception 'stale pattern update accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.finance_set_notification_pattern_v1('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000012',p.id,false,p.revision);
  raise exception 'other owner pattern accepted';
 exception when no_data_found then null; end;
 -- Disabling a global starter creates only a personal override.
 select * into p from public.finance_notification_patterns where user_id is null and format_key='ryt-card-payment';
 p:=public.finance_set_notification_pattern_v1(u,s,p.id,false,p.revision);
 perform pg_temp.check_companion(p.user_id=u and not p.is_active,'starter disable is owner scoped');
 perform pg_temp.check_companion((select is_active from public.finance_notification_patterns where user_id is null and format_key='ryt-card-payment'),'global starter remains active');
 before_count:=(select count(*) from public.finance_notification_learning_reviews where user_id=u);
 r:=pg_temp.accept_notification(303); c:=(r->>'candidate_id')::uuid;
 perform public.finance_reject_candidate(u,c);
 r:=pg_temp.accept_notification(304); c:=(r->>'candidate_id')::uuid;
 perform public.finance_mark_candidate_duplicate(u,c,t);
 perform pg_temp.check_companion((select count(*)=before_count from public.finance_notification_learning_reviews where user_id=u),'reject and duplicate do not train');
 -- Deletion invalidates the currently supporting evidence before cascades remove it.
 r:=pg_temp.accept_notification(305); c:=(r->>'candidate_id')::uuid;
 r:=public.finance_confirm_notification_v1(u,c,md5('305')||md5('305'),args,config);
 t:=(r->'transaction'->>'id')::uuid;
 perform public.finance_delete_transaction(u,t);
 perform pg_temp.check_companion((select not evidence_valid from public.finance_notification_patterns where user_id=u and format_key='tng-incoming'),'deleted evidence invalidated');
end $$;
reset role;
select pg_temp.check_companion(not has_table_privilege('authenticated','public.finance_notification_patterns','SELECT'),'browser cannot read patterns directly');
select pg_temp.check_companion(not has_function_privilege('anon','public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb)','EXECUTE'),'anonymous cannot call learning RPC');
rollback;
