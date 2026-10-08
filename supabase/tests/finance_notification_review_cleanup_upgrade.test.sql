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

-- Run only against the predecessor that still has the review audit table.
set local role service_role;
do $$
declare u uuid:='21000000-0000-4000-8000-000000000001'; r jsonb; c uuid;
begin
 r:=pg_temp.accept_notification(301); c:=(r->>'candidate_id')::uuid;
 perform public.finance_confirm_notification_v1(u,c,md5('301')||md5('301'),
  jsonb_build_object('p_source_id','21000000-0000-4000-8000-000000000011','p_direction','income','p_amount',25.9,
   'p_payee_name','Alex','p_transaction_date',current_date,'p_currency','MYR','p_allow_duplicate',true,
   'p_duplicate_override_reason','Synthetic upgrade fixture','p_confirmation_mode','manual'),
  '{"format_key":"tng-incoming","name":"Reviewed transfer","definition":{"version":1,"parts":[{"kind":"text","field":"payee_name"}," has transferred ",{"kind":"amount","field":"amount"}," to you"],"direction":"income"}}');
 perform pg_temp.check_companion((select count(*)=1 from public.finance_notification_learning_reviews where user_id=u),'predecessor contains an audit row');
end $$;
reset role;
create temporary table retained_notification_rows as
select 'patterns' as label,jsonb_agg(to_jsonb(t) order by id) as data from public.finance_notification_patterns t
union all select 'transactions',jsonb_agg(to_jsonb(t) order by id) from public.finance_transactions t
union all select 'candidates',jsonb_agg(to_jsonb(t) order by id) from public.finance_candidate_transactions t
union all select 'notification_events',jsonb_agg(to_jsonb(t) order by id) from public.finance_notification_events t;
create temporary table notification_rpc_contract as
select proacl,proconfig,prosecdef,proowner from pg_proc where oid='public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb)'::regprocedure;

\ir ../migrations/20261008032651_remove_notification_learning_reviews.sql

select pg_temp.check_companion(to_regclass('public.finance_notification_learning_reviews') is null,'audit table removed');
select pg_temp.check_companion(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','finance_private') and p.prosrc like '%finance_notification_learning_reviews%'),'audit callers removed');
select pg_temp.check_companion(not exists(
 select * from retained_notification_rows except
 (select 'patterns',jsonb_agg(to_jsonb(t) order by id) from public.finance_notification_patterns t
 union all select 'transactions',jsonb_agg(to_jsonb(t) order by id) from public.finance_transactions t
 union all select 'candidates',jsonb_agg(to_jsonb(t) order by id) from public.finance_candidate_transactions t
 union all select 'notification_events',jsonb_agg(to_jsonb(t) order by id) from public.finance_notification_events t)
),'saved patterns and transaction/intake rows preserved');
select pg_temp.check_companion((select to_jsonb(p)=to_jsonb(c) from
 (select proacl,proconfig,prosecdef,proowner from pg_proc where oid='public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb)'::regprocedure) p
 cross join notification_rpc_contract c),'RPC permissions and search path preserved');
rollback;
