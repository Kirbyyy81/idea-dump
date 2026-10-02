insert into public.dim_modules (
  modules, name, path, sort_order, is_managed, is_always_allowed,
  icon, description, enabled
)
values (
  'documentation', 'Documentation', '/documentation', 85, true, false,
  'Files', 'Read and search the private Notion Document Hub.', true
)
on conflict (modules) do update set
  name = excluded.name,
  path = excluded.path,
  sort_order = excluded.sort_order,
  is_managed = excluded.is_managed,
  is_always_allowed = excluded.is_always_allowed,
  icon = excluded.icon,
  description = excluded.description,
  enabled = excluded.enabled;

insert into public.bridge_role_modules (role_id, module_id)
select roles.id, modules.id
from public.dim_roles roles
cross join public.dim_modules modules
where roles.role = 'owner' and modules.modules = 'documentation'
on conflict do nothing;
