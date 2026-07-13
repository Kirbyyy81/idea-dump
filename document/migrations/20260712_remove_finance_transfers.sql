delete from public.finance_transactions
where direction = 'transfer';

update public.finance_rules
set direction = null,
    updated_at = now()
where direction = 'transfer';

alter table public.finance_transactions
  drop constraint if exists finance_transactions_direction_check,
  add constraint finance_transactions_direction_check
    check (direction in ('expense', 'income'));

alter table public.finance_rules
  drop constraint if exists finance_rules_direction_check,
  add constraint finance_rules_direction_check
    check (direction in ('expense', 'income'));
