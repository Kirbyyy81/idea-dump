-- One-time backfill for legacy shared-agent log rows.
--
-- Replace the placeholder UUIDs before running:
--   <OLD_SHARED_AGENT_USER_ID> = the former shared AGENT_USER_ID
--   <REAL_OWNER_USER_ID>       = the one real owning auth.users.id
--
-- Run a SELECT first to confirm the row count, then the UPDATE.

select count(*) as shared_agent_log_count
from public.daily_logs
where user_id = '<OLD_SHARED_AGENT_USER_ID>'::uuid
  and source = 'agent';

update public.daily_logs
set user_id = '<REAL_OWNER_USER_ID>'::uuid
where user_id = '<OLD_SHARED_AGENT_USER_ID>'::uuid
  and source = 'agent';

select count(*) as remaining_shared_agent_log_count
from public.daily_logs
where user_id = '<OLD_SHARED_AGENT_USER_ID>'::uuid
  and source = 'agent';
