insert into public.DIM_modules (modules, name)
values
  ('projects', 'Projects'),
  ('access_control', 'Access Control'),
  ('dashboard', 'Dashboard')
on conflict (modules) do update
set name = excluded.name;

insert into public.BRIDGE_role_modules (role_id, module_id)
select distinct role_rows.id, projects_module.id
from public.BRIDGE_role_modules role_modules
join public.DIM_roles role_rows on role_rows.id = role_modules.role_id
join public.DIM_modules old_dashboard on old_dashboard.id = role_modules.module_id
join public.DIM_modules projects_module on projects_module.modules = 'projects'
where old_dashboard.modules = 'dashboard'
on conflict do nothing;

insert into public.app_user_module_overrides (user_id, module_id, effect)
select distinct overrides.user_id, projects_module.id, overrides.effect
from public.app_user_module_overrides overrides
join public.DIM_modules old_dashboard on old_dashboard.id = overrides.module_id
join public.DIM_modules projects_module on projects_module.modules = 'projects'
where old_dashboard.modules = 'dashboard'
on conflict (user_id, module_id) do update
set effect = excluded.effect;

delete from public.BRIDGE_role_modules
where module_id in (
  select id from public.DIM_modules where modules = 'dashboard'
);

delete from public.app_user_module_overrides
where module_id in (
  select id from public.DIM_modules where modules = 'dashboard'
);

insert into public.BRIDGE_role_modules (role_id, module_id)
select role_rows.id, access_module.id
from public.DIM_roles role_rows
join public.DIM_modules access_module on access_module.modules = 'access_control'
where role_rows.role in ('owner', 'admin')
on conflict do nothing;
