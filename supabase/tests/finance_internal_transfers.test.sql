\set ON_ERROR_STOP on
begin;
create function pg_temp.check_transfer(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('62000000-0000-4000-8000-000000000001');
insert into public.bridge_user_module_overrides(user_id,module_id,effect)
select '62000000-0000-4000-8000-000000000001',id,'allow' from public.dim_modules where modules='finance';
insert into public.dim_finance_sources(id,user_id,name) values
('62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000001','Synthetic transfer Ryt'),
('62000000-0000-4000-8000-000000000012','62000000-0000-4000-8000-000000000001','Synthetic transfer TNG');
set local role service_role;
do $$
declare owner uuid:='62000000-0000-4000-8000-000000000001'; out_tx public.finance_transactions; in_tx public.finance_transactions;
 first jsonb; second jsonb; linked jsonb; pair public.finance_internal_transfers; rules jsonb; budget uuid; configuration jsonb; frozen jsonb;
begin
 select * into out_tx from public.finance_create_manual_transaction_v2(owner,'62000000-0000-4000-8000-000000000011',null,'expense',100,null,'My TNG','2026-11-19',null,'MYR',null,gen_random_uuid());
 select * into in_tx from public.finance_create_manual_transaction_v2(owner,'62000000-0000-4000-8000-000000000012',null,'income',100,null,'My Ryt','2026-11-19',null,'MYR',null,gen_random_uuid());
 configuration:=jsonb_build_object('name','Transfer source budget','amount','1000.00','cycle_type','monthly','start_date','2026-11-01',
  'anchor_day',1,'custom_days',null,'time_zone','Asia/Kuala_Lumpur','filter_logic','and','source_ids',jsonb_build_array('62000000-0000-4000-8000-000000000011'),
  'category_ids','[]'::jsonb,'tag_ids','[]'::jsonb,'include_uncategorised',false);
 budget:=public.finance_budget_mutate(owner,'create',null,null,gen_random_uuid(),configuration,'2026-11-01T00:00:00Z');
 perform pg_temp.check_transfer((select count(*)=1 from public.finance_budget_matching(owner,budget,null,null)),'source budget counts the outgoing leg before linking');
 perform public.finance_budget_reconcile(owner,budget,'2026-12-02T00:00:00Z');
 select jsonb_agg(to_jsonb(c) order by c.id) into frozen from public.finance_budget_cycles c where c.budget_id=budget and c.frozen_at is not null;
 first:=finance_private.transfer_entry(owner,'transaction',out_tx.id);
 second:=finance_private.transfer_entry(owner,'transaction',in_tx.id);
 linked:=public.finance_link_internal_transfer(owner,first,second,true);
 select * into pair from public.finance_internal_transfers where id=(linked->>'id')::uuid and user_id=owner;
 perform pg_temp.check_transfer(pair.id is not null,'transfer pair created');
 perform pg_temp.check_transfer((select count(*)=0 from public.finance_budget_matching(owner,budget,null,null)),'linked legs are excluded from source-specific budgets');
 perform pg_temp.check_transfer(frozen=(select jsonb_agg(to_jsonb(c) order by c.id) from public.finance_budget_cycles c where c.budget_id=budget and c.frozen_at is not null),'closed budget history is unchanged');
 perform pg_temp.check_transfer((select count(*)=2 from public.finance_transactions where user_id=owner and transfer_id=pair.id),'exactly two linked movements');
 perform pg_temp.check_transfer(public.finance_link_internal_transfer(owner,first,second)->>'id'=pair.id::text,'link replay');
 rules:=public.finance_internal_transfer_rules(owner);
 perform pg_temp.check_transfer(jsonb_array_length(rules)=1,'explicit reusable rule');
 begin
  perform public.finance_delete_transaction(owner,out_tx.id);
  raise exception 'linked deletion allowed';
 exception when check_violation then null; end;
 begin
  update public.finance_transactions set amount=101 where id=out_tx.id and user_id=owner;
  raise exception 'linked financial edit allowed';
 exception when check_violation then null; end;
 update public.finance_transactions set notes='Preserved note' where id=out_tx.id and user_id=owner;
 perform public.finance_unlink_internal_transfer(owner,pair.id,pair.created_at);
 perform pg_temp.check_transfer((select count(*)=2 from public.finance_transactions where user_id=owner and transfer_id is null),'unlink restores ordinary entries');
 perform pg_temp.check_transfer((select count(*)=1 from public.finance_budget_matching(owner,budget,null,null)),'unlink restores source budget matching');
 perform pg_temp.check_transfer(exists(select 1 from public.finance_internal_transfer_dismissals where user_id=owner and outgoing_transaction_id=out_tx.id and incoming_transaction_id=in_tx.id),'unlinked pair cannot auto-link again');
 perform pg_temp.check_transfer(not has_table_privilege('authenticated','public.finance_internal_transfers','select'),'browser table reads denied');
 perform pg_temp.check_transfer(not has_function_privilege('authenticated','public.finance_link_internal_transfer(uuid,jsonb,jsonb,boolean,boolean)','execute'),'browser direct linking denied');
 perform public.finance_delete_transaction(owner,out_tx.id);
 perform pg_temp.check_transfer(not exists(select 1 from public.finance_transactions where id=out_tx.id),'unlinked deletion allowed');
end $$;
set constraints all immediate;
rollback;
