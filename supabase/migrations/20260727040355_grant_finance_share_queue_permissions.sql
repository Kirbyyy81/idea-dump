-- PGMQ functions execute with the caller's table privileges. The Finance
-- service role uses send, read, and delete, which together require all four
-- DML privileges on this one private queue plus its identity sequence.
revoke all on table pgmq.q_finance_share_ocr
  from public, anon, authenticated;
revoke all on sequence pgmq.q_finance_share_ocr_msg_id_seq
  from public, anon, authenticated;

grant select, insert, update, delete
  on table pgmq.q_finance_share_ocr
  to service_role;
grant usage, select
  on sequence pgmq.q_finance_share_ocr_msg_id_seq
  to service_role;
