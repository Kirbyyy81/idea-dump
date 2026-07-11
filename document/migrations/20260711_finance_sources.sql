create table if not exists public.finance_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_sources_user_name_idx
  on public.finance_sources(user_id, lower(name));

insert into public.finance_sources (user_id, name)
select distinct user_id, name
from public.finance_accounts
on conflict do nothing;

alter table public.finance_transactions
  add column if not exists source_id uuid references public.finance_sources(id) on delete restrict;

alter table public.finance_rules
  add column if not exists source_id uuid references public.finance_sources(id) on delete set null;

update public.finance_transactions transactions
set source_id = sources.id
from public.finance_accounts accounts
join public.finance_sources sources
  on sources.user_id = accounts.user_id
 and lower(sources.name) = lower(accounts.name)
where transactions.account_id = accounts.id
  and transactions.source_id is null;

update public.finance_rules rules
set source_id = sources.id
from public.finance_accounts accounts
join public.finance_sources sources
  on sources.user_id = accounts.user_id
 and lower(sources.name) = lower(accounts.name)
where rules.account_id = accounts.id
  and rules.source_id is null;

insert into public.finance_sources (user_id, name)
select distinct user_id, 'Unknown source'
from public.finance_transactions
where source_id is null
on conflict do nothing;

update public.finance_transactions transactions
set source_id = sources.id
from public.finance_sources sources
where sources.user_id = transactions.user_id
  and sources.name = 'Unknown source'
  and transactions.source_id is null;

alter table public.finance_transactions
  alter column source_id set not null,
  drop column account_id;

alter table public.finance_rules
  drop column account_id;

drop table public.finance_accounts;

create index if not exists finance_sources_user_id_idx on public.finance_sources(user_id);
create index if not exists finance_transactions_source_id_idx on public.finance_transactions(source_id);

alter table public.finance_sources enable row level security;

create policy "Users can view own finance sources" on public.finance_sources
  for select using (auth.uid() = user_id);

create policy "Users can insert own finance sources" on public.finance_sources
  for insert with check (auth.uid() = user_id);

create policy "Users can update own finance sources" on public.finance_sources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own finance sources" on public.finance_sources
  for delete using (auth.uid() = user_id);
