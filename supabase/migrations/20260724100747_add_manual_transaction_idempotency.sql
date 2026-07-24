alter table public.finance_transactions
  add column manual_idempotency_key uuid;

create unique index finance_transactions_manual_idempotency_idx
  on public.finance_transactions (user_id, manual_idempotency_key)
  where source = 'manual'
    and manual_idempotency_key is not null;

comment on column public.finance_transactions.manual_idempotency_key is
  'Client-generated request key used to recover manual transaction POST responses without inserting a duplicate.';
