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
declare r jsonb; c uuid; i uuid; t uuid;
begin
    begin
        perform public.finance_accept_notification_v1('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',pg_temp.notification_event(99),repeat('a',64),pg_temp.notification_parse());
        raise exception 'other owner device accepted';
    exception when raise_exception then if sqlerrm<>'device_revoked' then raise; end if; end;
    begin
        perform public.finance_accept_notification_v1('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000022',pg_temp.notification_event(99),repeat('a',64),pg_temp.notification_parse());
        raise exception 'other owner source accepted';
    exception when raise_exception then if sqlerrm<>'source_unavailable' then raise; end if; end;
    r:=pg_temp.accept_notification(101); c:=(r->>'candidate_id')::uuid; i:=(r->>'intake_item_id')::uuid;
    perform pg_temp.check_companion(pg_temp.accept_notification(101)->>'replayed'='true','event replay');
    perform pg_temp.check_companion((select count(*)=1 from public.finance_candidate_transactions),'one candidate');
    begin
        perform public.finance_accept_notification_v1('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000021',pg_temp.notification_event(101),repeat('d',64),pg_temp.notification_parse());
        raise exception 'changed payload accepted';
    exception when raise_exception then if sqlerrm<>'event_conflict' then raise; end if; end;
    update public.finance_candidate_transactions set confidence=1 where id=c;
    perform pg_temp.check_companion((select confidence is null from public.finance_candidate_transactions where id=c),'manual review enforced');
    begin
        perform public.finance_confirm_candidate_v3('21000000-0000-4000-8000-000000000001',c,'21000000-0000-4000-8000-000000000011',null,'income',25.90,null,'Alex',current_date,null,'MYR',null,false,null,'automatic');
        raise exception 'automatic notification confirmation accepted';
    exception when check_violation then null; end;
    r:=public.finance_confirm_candidate_v3('21000000-0000-4000-8000-000000000001',c,'21000000-0000-4000-8000-000000000011',null,'income',25.90,null,'Alex',current_date,null,'MYR',null,false,null,'manual');
    perform pg_temp.check_companion((r->>'confirmed')::boolean,'manual confirmation');
    t:=(r->'transaction'->>'id')::uuid;
    perform pg_temp.check_companion(r->'transaction'->>'source'='notification','ledger origin');
    perform pg_temp.check_companion((select body is null and title is null and subtext is null and status='completed' and raw_deleted_at is not null from public.finance_notification_events where intake_item_id=i),'confirm deletes raw text');
    perform pg_temp.check_companion(not exists(select 1 from public.finance_corrections where intake_item_id=i and context_excerpt is not null),'no raw correction excerpt');
    perform pg_temp.check_companion(pg_temp.accept_notification(101)->>'status'='completed','replay after deletion');
    r:=pg_temp.accept_notification(102); c:=(r->>'candidate_id')::uuid; i:=(r->>'intake_item_id')::uuid;
    perform public.finance_reject_candidate('21000000-0000-4000-8000-000000000001',c);
    perform pg_temp.check_companion((select body is null and status='rejected' from public.finance_notification_events where intake_item_id=i),'reject deletes raw');
    r:=pg_temp.accept_notification(103); c:=(r->>'candidate_id')::uuid; i:=(r->>'intake_item_id')::uuid;
    perform public.finance_mark_candidate_duplicate('21000000-0000-4000-8000-000000000001',c,t);
    perform pg_temp.check_companion((select body is null and status='duplicate' from public.finance_notification_events where intake_item_id=i),'duplicate deletes raw');
    r:=public.finance_accept_notification_v1('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000021',pg_temp.notification_event(104),repeat('e',64),'{"status":"ignored","date_provenance":"unavailable","payload":null}');
    perform pg_temp.check_companion((select body is null and intake_item_id is null from public.finance_notification_events where id=(r->>'event_id')::uuid),'ignored content never stored');
    update public.companion_devices set revoked_at=now() where id='21000000-0000-4000-8000-000000000021';
    begin perform pg_temp.accept_notification(105); raise exception 'revoked device accepted';
    exception when raise_exception then if sqlerrm<>'device_revoked' then raise; end if; end;
end $$;
reset role;
select pg_temp.check_companion(not has_table_privilege('authenticated','public.finance_notification_events','SELECT'),'notification data is server only');
rollback;
