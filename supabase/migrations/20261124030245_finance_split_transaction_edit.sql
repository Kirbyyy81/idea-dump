begin;
set local lock_timeout='10s';

-- Read the original form values and allocation version from one MVCC snapshot.
create function public.finance_get_split_transaction_edit(p_user_id uuid,p_payment_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('transaction',to_jsonb(t)||jsonb_build_object(
  'foreign_amount',t.foreign_amount::text,'finance_source',to_jsonb(s),'finance_payee',to_jsonb(p),
  'category',snapshot->'payment'->'category','tags',snapshot->'payment'->'tags'), 'split',snapshot)
 from public.finance_transactions t
 left join public.dim_finance_sources s on s.id=t.source_id and s.user_id=t.user_id
 left join public.dim_finance_payees p on p.id=t.payee_id and p.user_id=t.user_id
 cross join lateral(select public.finance_get_transaction_split(p_user_id,p_payment_id) snapshot) data
 where t.user_id=p_user_id and t.id=p_payment_id and t.is_split and t.status='confirmed';
$$;

-- Reuse the reviewed normal editor and split writer in one locked transaction.
-- The temporary unsplit state is never committed or visible to other sessions.
create function public.finance_update_split_transaction(p_user_id uuid,p_payment_id uuid,p_version text,p_input jsonb,p_parts jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare payment public.finance_transactions; snapshot jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into payment from public.finance_transactions where user_id=p_user_id and id=p_payment_id and status='confirmed' for update;
 if not found then raise exception 'Payment not found' using errcode='P0002'; end if;
 snapshot:=public.finance_get_transaction_split(p_user_id,p_payment_id);
 if not payment.is_split or p_version is distinct from snapshot->>'version' then
  raise exception 'Payment changed' using errcode='40001';
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_parts) is distinct from 'array'
  or jsonb_array_length(p_parts) not between 2 and 3 then
  raise exception 'Choose two or three parts' using errcode='22023';
 end if;
 perform finance_private.reconcile_transfer_budgets(p_user_id);
 update public.finance_transactions set is_split=false where user_id=p_user_id and id=p_payment_id;
 perform public.finance_save_tagged_transaction(p_user_id,p_input,p_payment_id);
 snapshot:=public.finance_get_transaction_split(p_user_id,p_payment_id);
 perform public.finance_save_transaction_split(p_user_id,p_payment_id,snapshot->>'version',p_parts);
 perform finance_private.check_split_total(p_payment_id,p_user_id);
end $$;

revoke all on function public.finance_get_split_transaction_edit(uuid,uuid),
 public.finance_update_split_transaction(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_get_split_transaction_edit(uuid,uuid),
 public.finance_update_split_transaction(uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
