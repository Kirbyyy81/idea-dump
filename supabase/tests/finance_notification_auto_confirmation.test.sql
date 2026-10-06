\set ON_ERROR_STOP on
begin;
create function pg_temp.check_auto(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('61000000-0000-4000-8000-000000000001'),('61000000-0000-4000-8000-000000000002');
insert into public.bridge_user_module_overrides(user_id,module_id,effect)
select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m
where u.id in ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002') and m.modules='finance';
insert into public.dim_finance_sources(id,user_id,name) values
('61000000-0000-4000-8000-000000000011','61000000-0000-4000-8000-000000000001','Ryt'),
('61000000-0000-4000-8000-000000000012','61000000-0000-4000-8000-000000000002','Other');
insert into public.companion_devices(id,user_id,token_hash,label) values
('61000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000001',repeat('6',64),'Synthetic phone');
create function pg_temp.auto_payload(amount numeric default 16) returns jsonb language sql as $$
select jsonb_build_object('source_id','61000000-0000-4000-8000-000000000011','amount',amount,'currency','MYR',
 'direction','expense','merchant','Synthetic Cafe','payee_name',null,'category_id',null,'reference_number',null,'notes',null,
 'transaction_date',(now() at time zone 'Asia/Kuala_Lumpur')::date::text,
 'notification_extraction',jsonb_build_object('version',1,'conflicts','[]'::jsonb,'date_provenance','posted_at','fields',
 jsonb_build_object('amount',jsonb_build_object('pattern_id','52000000-0000-4000-8000-000000000008','revision',1,'learned',false))))
$$;
create function pg_temp.auto_parsed(payload jsonb) returns jsonb language sql as $$
select jsonb_build_object('status','review','date_provenance','posted_at','payload',payload,'duplicate_outcome','none','duplicate_score',0,'duplicate_signals','[]'::jsonb)
$$;
create function pg_temp.auto_event(n int) returns jsonb language sql as $$
select jsonb_build_object('client_event_id','61000000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'source_id','61000000-0000-4000-8000-000000000011','source_package','my.rytbank.app',
 'notification_key_hash',repeat('6',64),'captured_at',now(),'notification',
 jsonb_build_object('title','Card payment completed','text','RM16.00 paid at Synthetic Cafe using your Main Account.','posted_at',now()))
$$;
create function pg_temp.auto_accept(n int,p jsonb) returns jsonb language sql as $$
select public.finance_accept_notification_v2('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000021',
 pg_temp.auto_event(n),repeat('6',64),pg_temp.auto_parsed(p))
$$;
create function pg_temp.fail_auto_event() returns trigger language plpgsql as $$
begin
 if new.event_type='notification_auto_confirmed' and current_setting('test.notification_auto_failure',true)='on' then
  raise exception 'synthetic auto failure'; end if;
 return new;
end $$;
create trigger test_auto_failure before insert on public.finance_processing_events for each row execute function pg_temp.fail_auto_event();
set local role service_role;
do $$
declare r jsonb; c uuid; i uuid; t uuid; p jsonb; n int:=200; before_count int;
begin
 r:=pg_temp.auto_accept(101,pg_temp.auto_payload()); c:=(r->>'candidate_id')::uuid;i:=(r->>'intake_item_id')::uuid;
 perform pg_temp.check_auto(r->>'status'='completed','complete merchant notification skips review without category or reference');
 select id into t from public.finance_transactions where intake_item_id=i;
 perform pg_temp.check_auto((select amount=16 and direction='expense' and merchant='Synthetic Cafe' and category_id is null and reference_number is null and source='notification' from public.finance_transactions where id=t),'saved fields and lineage');
 perform pg_temp.check_auto((select status='accepted' from public.finance_candidate_transactions where id=c),'candidate accepted');
 perform pg_temp.check_auto((select body is null and title is null and subtext is null and raw_deleted_at is not null from public.finance_notification_events where intake_item_id=i),'automatic raw deletion');
 perform pg_temp.check_auto(exists(select 1 from public.finance_processing_events where intake_item_id=i and event_type='notification_auto_confirmed' and detail->>'mode'='automatic'),'automatic provenance');
 perform pg_temp.check_auto(not exists(select 1 from public.finance_notification_learning_reviews where transaction_id=t),'automatic is not training');
 perform pg_temp.check_auto(not exists(select 1 from public.finance_corrections where transaction_id=t),'automatic values are not corrections');
 r:=pg_temp.auto_accept(101,pg_temp.auto_payload());
 perform pg_temp.check_auto(r->>'status'='completed' and r->>'replayed'='true','completed upload replay');
 perform pg_temp.check_auto((select count(*)=1 from public.finance_transactions where user_id='61000000-0000-4000-8000-000000000001'),'single replay transaction');

 r:=pg_temp.auto_accept(102,pg_temp.auto_payload(17)||'{"merchant":null,"payee_name":"Alex","direction":"income"}');
 i:=(r->>'intake_item_id')::uuid;
 perform pg_temp.check_auto(r->>'status'='completed','payee instead of merchant is sufficient');
 perform pg_temp.check_auto((select p.name='Alex' and t.direction='income' from public.finance_transactions t join public.dim_finance_payees p on p.id=t.payee_id where t.intake_item_id=i),'saved payee resolved');

 r:=pg_temp.auto_accept(103,pg_temp.auto_payload(16));
 perform pg_temp.check_auto(r->>'status'='review','duplicate kept for review despite advisory none');
 perform pg_temp.check_auto((select duplicate_outcome='strong' from public.finance_candidate_transactions where id=(r->>'candidate_id')::uuid),'database rechecks duplicate');
 r:=pg_temp.auto_accept(104,pg_temp.auto_payload(17)||'{"merchant":"Other cafe"}');
 perform pg_temp.check_auto(r->>'status'='review','possible duplicate kept for review');

 for p in select (value#>>'{}')::jsonb from jsonb_array_elements(jsonb_build_array(
  '{"amount":null}', '{"amount":0}', '{"amount":-1}', '{"amount":1.001}', '{"amount":"invalid"}',
  '{"direction":null}', '{"direction":"unknown"}', '{"merchant":null,"payee_name":null}', '{"merchant":"   "}',
  '{"transaction_date":null}', '{"transaction_date":"2026-02-30"}','{"transaction_date":"9999-01-01"}',
  '{"currency":"USD"}','{"merchant":42}','{"reference_number":123}','{"category_id":"61000000-0000-4000-8000-000000000099"}'
 )::jsonb) loop
  n:=n+1;
  begin
   r:=pg_temp.auto_accept(n,pg_temp.auto_payload(30+n)||p);
   perform pg_temp.check_auto(r->>'status'='review','incomplete/invalid payload stays review: '||p::text);
  exception when invalid_parameter_value or foreign_key_violation or check_violation then
   if p->>'direction' is distinct from 'unknown' and not (p ? 'category_id') then raise; end if;
   perform pg_temp.check_auto(not exists(select 1 from public.finance_notification_events where client_event_id=(pg_temp.auto_event(n)->>'client_event_id')::uuid),'invalid dimensions roll back intake');
  end;
 end loop;
 p:=jsonb_set(pg_temp.auto_payload(50),'{notification_extraction,conflicts}','["direction"]');
 perform pg_temp.check_auto(pg_temp.auto_accept(105,p)->>'status'='review','unresolved rule conflict');
 p:=jsonb_set(pg_temp.auto_payload(51),'{notification_extraction,fields,amount,revision}','999');
 perform pg_temp.check_auto(pg_temp.auto_accept(106,p)->>'status'='review','stale pattern');
 perform public.finance_set_notification_pattern_v1('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000011',
  '52000000-0000-4000-8000-000000000008',false,1);
 perform pg_temp.check_auto(pg_temp.auto_accept(107,pg_temp.auto_payload(52))->>'status'='review','disabled starter cannot auto-confirm stale parse');
 delete from public.finance_notification_patterns where user_id='61000000-0000-4000-8000-000000000001';

 r:=pg_temp.auto_accept(108,pg_temp.auto_payload(60)||'{"amount":null}');c:=(r->>'candidate_id')::uuid;
 perform pg_temp.check_auto(pg_temp.auto_accept(108,pg_temp.auto_payload(60))->>'status'='review','upload replay does not reinterpret pending candidate');
 begin
  perform public.finance_retry_notification_v1('61000000-0000-4000-8000-000000000001',c,repeat('a',64),pg_temp.auto_parsed(pg_temp.auto_payload(60)));
  raise exception 'stale retry accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.finance_retry_notification_v1('61000000-0000-4000-8000-000000000002',c,repeat('6',64),pg_temp.auto_parsed(pg_temp.auto_payload(60)));
  raise exception 'other owner retry accepted';
 exception when no_data_found then null; end;
 r:=public.finance_retry_notification_v1('61000000-0000-4000-8000-000000000001',c,repeat('6',64),pg_temp.auto_parsed(pg_temp.auto_payload(60)||'{"amount":null}'));
 perform pg_temp.check_auto(r->>'confirmed'='false' and r->'candidate'->'intake'->'notification'->>'body' is not null,'incomplete retry preserves raw review display');
 r:=public.finance_retry_notification_v1('61000000-0000-4000-8000-000000000001',c,repeat('6',64),pg_temp.auto_parsed(pg_temp.auto_payload(60)));
 perform pg_temp.check_auto(r->>'confirmed'='true','explicit retry auto-adds complete values');
 begin
  perform public.finance_retry_notification_v1('61000000-0000-4000-8000-000000000001',c,repeat('6',64),pg_temp.auto_parsed(pg_temp.auto_payload(60)));
  raise exception 'resolved retry accepted';
 exception when serialization_failure then null; end;

 -- Any unexpected failure rolls back the event, candidate, ledger write and raw deletion together.
 select count(*) into before_count from public.finance_transactions;
 perform set_config('test.notification_auto_failure','on',true);
 begin
  perform pg_temp.auto_accept(199,pg_temp.auto_payload(99));
  raise exception 'atomic failure was swallowed';
 exception when raise_exception then if sqlerrm<>'synthetic auto failure' then raise; end if; end;
 perform set_config('test.notification_auto_failure','off',true);
 perform pg_temp.check_auto((select count(*)=before_count from public.finance_transactions),'failed automatic confirmation rolls back transaction');
 perform pg_temp.check_auto(not exists(select 1 from public.finance_notification_events where client_event_id=(pg_temp.auto_event(199)->>'client_event_id')::uuid),'failed automatic confirmation rolls back upload');

 -- Screenshot automatic policy still requires confidence, category and a strong rule.
 insert into public.finance_intake_items(user_id,source,status) values('61000000-0000-4000-8000-000000000001','screenshot','review') returning id into i;
 insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,confidence)
 values('61000000-0000-4000-8000-000000000001',i,pg_temp.auto_payload(80),null) returning id into c;
 begin
  perform public.finance_confirm_candidate_v3('61000000-0000-4000-8000-000000000001',c,'61000000-0000-4000-8000-000000000011',null,'expense',80,'Synthetic Cafe',null,current_date,null,'MYR',null,false,null,'automatic');
  raise exception 'screenshot automatic policy bypassed';
 exception when check_violation then null; end;

 select count(*) into before_count from public.finance_transactions;
 r:=public.finance_accept_notification_v2('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000021',
 pg_temp.auto_event(109),repeat('6',64),'{"status":"ignored","date_provenance":"unavailable","payload":null}');
 perform pg_temp.check_auto(r->>'status'='ignored' and (select count(*)=before_count from public.finance_transactions),'ignored never auto-confirms');
 begin
  perform public.finance_accept_notification_v2('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000021',pg_temp.auto_event(110),repeat('6',64),pg_temp.auto_parsed(pg_temp.auto_payload(99)));
  raise exception 'other owner intake accepted';
 exception when raise_exception then if sqlerrm<>'device_revoked' then raise; end if; end;
end $$;
reset role;
select pg_temp.check_auto(not has_function_privilege('authenticated','public.finance_accept_notification_v2(uuid,uuid,jsonb,text,jsonb)','EXECUTE'),'intake is server only');
select pg_temp.check_auto(not has_function_privilege('anon','public.finance_retry_notification_v1(uuid,uuid,text,jsonb)','EXECUTE'),'retry is server only');
rollback;
