insert into public."DIM_modules" (modules, name)
values ('tickets', 'Tickets')
on conflict (modules) do update
set name = excluded.name;

with desired_role_modules(role_slug, module_slug) as (
  values
    ('owner', 'projects'),
    ('owner', 'tickets'),
    ('owner', 'logs'),
    ('owner', 'log_viewer'),
    ('owner', 'api'),
    ('owner', 'access_control'),
    ('owner', 'article_creation'),
    ('owner', 'film_journal'),
    ('admin', 'projects'),
    ('admin', 'tickets'),
    ('admin', 'logs'),
    ('admin', 'log_viewer'),
    ('admin', 'api'),
    ('admin', 'access_control'),
    ('admin', 'article_creation'),
    ('admin', 'film_journal'),
    ('member', 'tickets'),
    ('member', 'logs'),
    ('member', 'log_viewer'),
    ('member', 'api'),
    ('member', 'film_journal')
),
desired_ids as (
  select role_rows.id as role_id, module_rows.id as module_id
  from desired_role_modules desired
  join public."DIM_roles" role_rows on role_rows.role = desired.role_slug
  join public."DIM_modules" module_rows on module_rows.modules = desired.module_slug
)
insert into public."BRIDGE_role_modules" (role_id, module_id)
select role_id, module_id
from desired_ids
on conflict do nothing;

with desired_role_modules(role_slug, module_slug) as (
  values
    ('owner', 'projects'),
    ('owner', 'tickets'),
    ('owner', 'logs'),
    ('owner', 'log_viewer'),
    ('owner', 'api'),
    ('owner', 'access_control'),
    ('owner', 'article_creation'),
    ('owner', 'film_journal'),
    ('admin', 'projects'),
    ('admin', 'tickets'),
    ('admin', 'logs'),
    ('admin', 'log_viewer'),
    ('admin', 'api'),
    ('admin', 'access_control'),
    ('admin', 'article_creation'),
    ('admin', 'film_journal'),
    ('member', 'tickets'),
    ('member', 'logs'),
    ('member', 'log_viewer'),
    ('member', 'api'),
    ('member', 'film_journal')
),
desired_ids as (
  select role_rows.id as role_id, module_rows.id as module_id
  from desired_role_modules desired
  join public."DIM_roles" role_rows on role_rows.role = desired.role_slug
  join public."DIM_modules" module_rows on module_rows.modules = desired.module_slug
),
built_in_roles as (
  select id
  from public."DIM_roles"
  where role in ('owner', 'admin', 'member')
)
delete from public."BRIDGE_role_modules" role_modules
using built_in_roles
where role_modules.role_id = built_in_roles.id
  and not exists (
    select 1
    from desired_ids
    where desired_ids.role_id = role_modules.role_id
      and desired_ids.module_id = role_modules.module_id
  );

alter table public."BRIDGE_role_modules" enable row level security;
alter table public.app_user_module_overrides enable row level security;
