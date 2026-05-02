create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  notes text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'to_review', 'done', 'closed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  source text not null default 'self'
    check (source in ('self', 'user_tester')),
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tickets enable row level security;

drop policy if exists "Users can view own tickets" on public.tickets;
create policy "Users can view own tickets" on public.tickets
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own tickets" on public.tickets;
create policy "Users can insert own tickets" on public.tickets
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own tickets" on public.tickets;
create policy "Users can update own tickets" on public.tickets
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own tickets" on public.tickets;
create policy "Users can delete own tickets" on public.tickets
  for delete using (auth.uid() = user_id);

create or replace function public.update_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tickets_updated_at on public.tickets;
create trigger tickets_updated_at
  before update on public.tickets
  for each row execute function public.update_tickets_updated_at();
