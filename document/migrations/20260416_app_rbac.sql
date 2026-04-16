create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.app_modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.app_role_modules (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  module_id uuid not null references public.app_modules(id) on delete cascade,
  primary key (role_id, module_id)
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete cascade
);

create table if not exists public.app_user_module_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.app_modules(id) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  unique (user_id, module_id)
);

insert into public.app_roles (slug, name)
values
  ('owner', 'Owner'),
  ('admin', 'Admin'),
  ('member', 'Member')
on conflict (slug) do update
set name = excluded.name;

insert into public.app_modules (slug, name)
values
  ('dashboard', 'Dashboard'),
  ('projects', 'Projects'),
  ('logs', 'Weekly Logs'),
  ('api', 'API'),
  ('article_creation', 'Article Creation'),
  ('settings', 'Settings')
on conflict (slug) do update
set name = excluded.name;

insert into public.app_role_modules (role_id, module_id)
select role_rows.id, module_rows.id
from public.app_roles role_rows
join public.app_modules module_rows
  on (
    (role_rows.slug in ('owner', 'admin') and module_rows.slug in ('projects', 'logs', 'api', 'article_creation'))
    or (role_rows.slug = 'member' and module_rows.slug in ('logs', 'api'))
  )
on conflict do nothing;
