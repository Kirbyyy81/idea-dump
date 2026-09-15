-- Run against the isolated predecessor schema, before the retirement migration.
-- Exercises the exact forward migration with existing legacy rows, then rolls back.
begin;
create function pg_temp.check_retired(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end; $f$;
insert into auth.users(id) values('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002');
insert into public.dim_modules(id,modules,name,path,enabled,is_always_allowed)
values('e1000000-0000-4000-8000-000000000010','finance','Finance','/finance',true,true)
on conflict(modules) do update set enabled=true,is_always_allowed=true;
insert into public.dim_finance_sources(id,user_id,name) values('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','Synthetic Bank');
insert into public.dim_finance_categories(id,user_id,name) values('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','Synthetic Category');
insert into public.finance_rules(id,user_id,name,match_type,pattern,source,source_id,category_id,direction,auto_created_at)
select md5('retired-rule-'||n)::uuid,'e1000000-0000-4000-8000-000000000001','Synthetic '||n,'keyword','synthetic '||n,
 case when n=3 then 'manual' else 'learning' end,'e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','expense',
 case when n=1 then clock_timestamp() end from generate_series(1,3) n;
insert into public.finance_field_learning_rules(user_id,source_id,field_name,transform_type,transform_value,evidence_count)
values('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','reference_number','strip_prefix','OCR-',3);
insert into public.finance_rule_suggestions(id,user_id,name,pattern,category_id,direction,evidence_count)
values('e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','Synthetic pending','synthetic pending','e1000000-0000-4000-8000-000000000004','expense',3);
insert into public.finance_intake_items(id,user_id,source,status,ocr_normalized_text)
values('e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','screenshot','completed','Synthetic receipt');
insert into public.finance_transactions(id,user_id,source_id,category_id,intake_item_id,status,direction,amount,transaction_date,source)
values('e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000006','confirmed','expense',12,'2026-09-15','screenshot');
insert into public.finance_candidate_transactions(user_id,intake_item_id,status,confirmed_transaction_id,payload)
values('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','accepted','e1000000-0000-4000-8000-000000000007','{"learned_field_rule_ids":["historical"],"parser_template_baseline":{"reference_number":"RECORDED"}}');
insert into public.finance_learning_runs(invocation_id,status,finished_at,legacy_inserted_count,legacy_rules_created)
values('e1000000-0000-4000-8000-000000000008','succeeded',clock_timestamp(),7,7);
create temporary table preserved as
 select 'intake' kind,to_jsonb(i) value from public.finance_intake_items i
 union all select 'transaction',to_jsonb(t) from public.finance_transactions t
 union all select 'candidate',to_jsonb(c) from public.finance_candidate_transactions c
 union all select 'run',to_jsonb(r) from public.finance_learning_runs r;
create temporary table legacy_before as
 select 'rule' kind,to_jsonb(r)-'is_active' value from public.finance_rules r
 union all select 'field',to_jsonb(r)-'is_active' from public.finance_field_learning_rules r
 union all select 'suggestion',to_jsonb(r) from public.finance_rule_suggestions r;
\ir ../migrations/20260915172224_retire_legacy_finance_learning.sql
select pg_temp.check_retired((select count(*)=2 and bool_and(not is_active) from public.finance_rules where source='learning'),'auto and accepted legacy rules disabled');
select pg_temp.check_retired((select bool_and(is_active) from public.finance_rules where source='manual'),'manual rule stays active');
select pg_temp.check_retired((select bool_and(not is_active) from public.finance_field_learning_rules),'legacy transforms disabled');
select pg_temp.check_retired(not exists(select * from legacy_before except (
 select 'rule',to_jsonb(r)-'is_active' from public.finance_rules r union all select 'field',to_jsonb(r)-'is_active' from public.finance_field_learning_rules r
 union all select 'suggestion',to_jsonb(r) from public.finance_rule_suggestions r)),'legacy rows and evidence preserved');
select pg_temp.check_retired(not exists(select * from preserved except (
 select 'intake',to_jsonb(i) from public.finance_intake_items i union all select 'transaction',to_jsonb(t) from public.finance_transactions t
 union all select 'candidate',to_jsonb(c) from public.finance_candidate_transactions c union all select 'run',to_jsonb(r) from public.finance_learning_runs r)),'migration leaves receipts, transactions, baselines and run history unchanged');
do $guards$ begin
 begin
  insert into public.finance_rules(user_id,name,match_type,pattern,source,direction) values('e1000000-0000-4000-8000-000000000001','New legacy','keyword','new legacy','learning','expense');
  raise exception 'inserted legacy rule'; exception when check_violation then null;
 end;
 begin
  insert into public.finance_field_learning_rules(user_id,source_id,field_name,transform_type,transform_value,evidence_count)
  values('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','reference_number','strip_suffix','-COPY',3);
  raise exception 'inserted legacy transform'; exception when check_violation then null;
 end;
 begin
  insert into public.finance_rule_suggestions(user_id,name,pattern,category_id,direction,evidence_count)
  values('e1000000-0000-4000-8000-000000000001','New suggestion','new suggestion','e1000000-0000-4000-8000-000000000004','expense',3);
  raise exception 'inserted legacy suggestion'; exception when check_violation then null;
 end;
 begin update public.finance_rules set is_active=true where source='learning'; raise exception 'reactivated legacy'; exception when check_violation then null; end;
 begin update public.finance_rules set source='manual' where source='learning'; raise exception 'converted legacy'; exception when check_violation then null; end;
 begin update public.finance_rules set source='learning' where source='manual'; raise exception 'created learned rule'; exception when check_violation then null; end;
 begin update public.finance_field_learning_rules set is_active=true; raise exception 'reactivated field'; exception when check_violation then null; end;
 begin update public.finance_field_learning_rules set evidence_count=4; raise exception 'changed evidence'; exception when check_violation then null; end;
 begin update public.finance_rule_suggestions set status='accepted'; raise exception 'accepted stale suggestion'; exception when check_violation then null; end;
end; $guards$;
set local role service_role;
do $rpc$ begin
 begin perform public.finance_accept_rule_suggestion('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005'); raise exception 'stale RPC activated'; exception when check_violation then null; end;
 begin perform public.finance_accept_rule_suggestion('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000005'); raise exception 'foreign suggestion visible'; exception when no_data_found then null; end;
end; $rpc$;
reset role;
select pg_temp.check_retired(public.finance_refresh_rule_suggestions_legacy_v1()=0,'legacy entry point is inert');
select public.finance_refresh_rule_suggestions('e1000000-0000-4000-8000-000000000009');
select public.finance_refresh_rule_suggestions('e1000000-0000-4000-8000-000000000009');
select pg_temp.check_retired((select count(*)=1 and bool_and(status='succeeded' and legacy_inserted_count=0 and legacy_rules_created=0 and legacy_rules_updated=0 and legacy_rules_disabled=0)
 from public.finance_learning_runs where invocation_id='e1000000-0000-4000-8000-000000000009'),'new runs succeed with zero legacy activity and retry once');
select pg_temp.check_retired(public.finance_refresh_rule_suggestions('e1000000-0000-4000-8000-000000000008')=7,'old invocation replay retains historical result');
select pg_temp.check_retired(not exists(select * from legacy_before except (
 select 'rule',to_jsonb(r)-'is_active' from public.finance_rules r union all select 'field',to_jsonb(r)-'is_active' from public.finance_field_learning_rules r
 union all select 'suggestion',to_jsonb(r) from public.finance_rule_suggestions r)),'refresh never changes legacy evidence');
select pg_temp.check_retired(not has_function_privilege('authenticated','public.finance_refresh_rule_suggestions_legacy_v1()','execute'),'retired helper remains private');
update public.finance_rules set is_active=false where source='manual';
update public.finance_rules set is_active=true where source='manual';
rollback;
