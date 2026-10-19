-- Cover the tenant-aware transaction relationship used during ledger cleanup.
create index finance_category_evidence_transaction_user
 on public.finance_category_evidence(transaction_id,user_id);
