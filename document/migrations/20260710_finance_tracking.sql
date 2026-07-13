insert into public."DIM_modules" (modules, name, path, sort_order, is_managed, is_always_allowed, icon, description, enabled)
values (
  'finance',
  'Finance',
  '/finance',
  60,
  true,
  false,
  'Landmark',
  'Track personal transactions, review captured spending, and maintain finance rules.',
  true
)
on conflict (modules) do update
set
  name = excluded.name,
  path = excluded.path,
  sort_order = excluded.sort_order,
  is_managed = excluded.is_managed,
  is_always_allowed = excluded.is_always_allowed,
  icon = excluded.icon,
  description = excluded.description,
  enabled = excluded.enabled;

insert into public."BRIDGE_role_modules" (role_id, module_id)
select role_rows.id, module_rows.id
from public."DIM_roles" role_rows
join public."DIM_modules" module_rows on module_rows.modules = 'finance'
where role_rows.role in ('owner', 'admin', 'member')
on conflict do nothing;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank', 'cash', 'credit_card', 'ewallet')),
  institution text,
  color text,
  opening_balance numeric(14, 2) not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  color text,
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create table if not exists public.finance_intake_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('screenshot', 'notification')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'review', 'completed', 'duplicate', 'failed', 'rejected')),
  image_hash text,
  ocr_text text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  category_id uuid references public.finance_categories(id) on delete set null,
  intake_item_id uuid references public.finance_intake_items(id) on delete set null,
  direction text not null check (direction in ('expense', 'income', 'transfer')),
  amount numeric(14, 2) not null check (amount > 0),
  merchant text,
  transaction_date date not null default current_date,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'screenshot')),
  status text not null default 'confirmed' check (status in ('confirmed', 'review', 'duplicate', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_candidate_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  intake_item_id uuid not null references public.finance_intake_items(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  confidence numeric(5, 4),
  matched_rule_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  match_type text not null check (match_type in ('exact_phrase', 'merchant_alias', 'keyword', 'account_hint')),
  pattern text not null,
  category_id uuid references public.finance_categories(id) on delete set null,
  account_id uuid references public.finance_accounts(id) on delete set null,
  direction text check (direction in ('expense', 'income', 'transfer')),
  priority integer not null default 100,
  is_active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'learning')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.finance_transactions(id) on delete set null,
  intake_item_id uuid references public.finance_intake_items(id) on delete set null,
  field_name text not null,
  previous_value jsonb,
  corrected_value jsonb,
  context_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists finance_accounts_user_id_idx on public.finance_accounts(user_id);
create index if not exists finance_categories_user_id_idx on public.finance_categories(user_id);
create index if not exists finance_transactions_user_date_idx on public.finance_transactions(user_id, transaction_date desc);
create index if not exists finance_transactions_account_id_idx on public.finance_transactions(account_id);
create index if not exists finance_transactions_category_id_idx on public.finance_transactions(category_id);
create index if not exists finance_intake_items_user_status_idx on public.finance_intake_items(user_id, status);
create index if not exists finance_intake_items_image_hash_idx on public.finance_intake_items(user_id, image_hash);
create index if not exists finance_corrections_user_id_idx on public.finance_corrections(user_id, created_at desc);
create unique index if not exists finance_intake_items_unique_image_idx
  on public.finance_intake_items(user_id, image_hash)
  where image_hash is not null;

create table if not exists public.finance_processing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  intake_item_id uuid not null references public.finance_intake_items(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_processing_events_intake_idx
  on public.finance_processing_events(intake_item_id, created_at);

create table if not exists public.finance_rule_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  pattern text not null,
  category_id uuid not null references public.finance_categories(id) on delete cascade,
  direction text not null check (direction in ('expense', 'income')),
  evidence_count integer not null check (evidence_count >= 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern, category_id, direction)
);

create or replace function public.finance_refresh_rule_suggestions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer := 0;
begin
  insert into public.finance_rule_suggestions (
    user_id,
    name,
    pattern,
    category_id,
    direction,
    evidence_count,
    status,
    updated_at
  )
  select
    corrections.user_id,
    initcap(lower(trim(transactions.merchant))) as name,
    lower(trim(transactions.merchant)) as pattern,
    parsed.category_id,
    transactions.direction,
    count(*)::integer as evidence_count,
    'pending',
    now()
  from public.finance_corrections corrections
  join public.finance_transactions transactions
    on transactions.id = corrections.transaction_id
   and transactions.user_id = corrections.user_id
  cross join lateral (
    select case
      when (corrections.corrected_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (corrections.corrected_value #>> '{}')::uuid
      else null
    end as category_id
  ) parsed
  join public.finance_categories categories
    on categories.id = parsed.category_id
   and categories.user_id = corrections.user_id
  where corrections.field_name = 'category_id'
    and corrections.corrected_value is not null
    and parsed.category_id is not null
    and transactions.merchant is not null
    and length(trim(transactions.merchant)) >= 3
    and transactions.direction in ('expense', 'income')
  group by corrections.user_id, lower(trim(transactions.merchant)), parsed.category_id, transactions.direction
  having count(*) >= 3
  on conflict (user_id, pattern, category_id, direction) do update
  set evidence_count = excluded.evidence_count,
      updated_at = now()
  where public.finance_rule_suggestions.status = 'pending';

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.finance_refresh_rule_suggestions() from public;
grant execute on function public.finance_refresh_rule_suggestions() to postgres, service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $schedule$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'finance-rule-learning') then
    perform cron.schedule(
      'finance-rule-learning',
      '15 3 * * *',
      'select public.finance_refresh_rule_suggestions();'
    );
  end if;
end;
$schedule$;

alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_intake_items enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_candidate_transactions enable row level security;
alter table public.finance_rules enable row level security;
alter table public.finance_corrections enable row level security;
alter table public.finance_processing_events enable row level security;
alter table public.finance_rule_suggestions enable row level security;
