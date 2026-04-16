-- PRD_002: Weekly Productivity Log
-- Apply this in the Supabase SQL editor (or your migration tool of choice).
--
-- Notes:
-- - All log fields live inside a single JSONB column: daily_logs.content
-- - The app expects `content` to be JSON (not plain text). If you currently have
--   a TEXT `content` column, see the optional migration at the bottom.

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('agent','human')),
  content jsonb not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_logs_user_date_idx
  on daily_logs (user_id, effective_date);

create index if not exists daily_logs_user_created_idx
  on daily_logs (user_id, created_at desc);

-- Optional: keep updated_at fresh on updates
create or replace function daily_logs_set_updated_at_fn()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists daily_logs_set_updated_at on daily_logs;
create trigger daily_logs_set_updated_at
before update on daily_logs
for each row execute function daily_logs_set_updated_at_fn();

-- Optional: If you already created daily_logs but content is TEXT:
-- 1) Create a new jsonb column.
-- 2) Best-effort convert text to jsonb where possible.
-- 3) Replace the old column.
--
-- alter table daily_logs add column if not exists content_jsonb jsonb;
-- update daily_logs
-- set content_jsonb =
--   case
--     when content is null then '{}'::jsonb
--     when left(trim(content), 1) = '{' then content::jsonb
--     else jsonb_build_object('operation_task', content)
--   end
-- where content_jsonb is null;
-- alter table daily_logs drop column content;
-- alter table daily_logs rename column content_jsonb to content;
