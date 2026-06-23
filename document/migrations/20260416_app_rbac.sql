create table if not exists public.DIM_roles (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  name text not null
);

create table if not exists public.DIM_modules (
  id uuid primary key default gen_random_uuid(),
  modules text not null unique,
  name text not null
);

create table if not exists public.BRIDGE_role_modules (
  role_id uuid not null references public.DIM_roles(id) on delete cascade,
  module_id uuid not null references public.DIM_modules(id) on delete cascade,
  primary key (role_id, module_id)
);

create table if not exists public.BRIDGE_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.DIM_roles(id) on delete cascade
);

create table if not exists public.app_user_module_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.DIM_modules(id) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  unique (user_id, module_id)
);

insert into public.DIM_roles (role, name)
values
  ('owner', 'Owner'),
  ('admin', 'Admin'),
  ('member', 'Member')
on conflict (role) do update
set name = excluded.name;

insert into public.DIM_modules (modules, name)
values
  ('dashboard', 'Dashboard'),
  ('projects', 'Projects'),
  ('logs', 'Weekly Logs'),
  ('api', 'API'),
  ('access_control', 'Access Control'),
  ('article_creation', 'Article Creation'),
  ('settings', 'Settings')
on conflict (modules) do update
set name = excluded.name;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role_rows.id, module_rows.id
from public.DIM_roles role_rows
join public.DIM_modules module_rows
  on (
    (role_rows.role in ('owner', 'admin') and module_rows.modules in ('projects', 'logs', 'api', 'access_control', 'article_creation'))
    or (role_rows.role = 'member' and module_rows.modules in ('logs', 'api'))
  )
on conflict do nothing;
