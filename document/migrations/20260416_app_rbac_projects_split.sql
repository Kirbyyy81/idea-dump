insert into public.app_modules (slug, name)
values
  ('projects', 'Projects'),
  ('dashboard', 'Dashboard')
on conflict (slug) do update
set name = excluded.name;

insert into public.app_role_modules (role_id, module_id)
select distinct role_rows.id, projects_module.id
from public.app_role_modules role_modules
join public.app_roles role_rows on role_rows.id = role_modules.role_id
join public.app_modules old_dashboard on old_dashboard.id = role_modules.module_id
join public.app_modules projects_module on projects_module.slug = 'projects'
where old_dashboard.slug = 'dashboard'
on conflict do nothing;

insert into public.app_user_module_overrides (user_id, module_id, effect)
select distinct overrides.user_id, projects_module.id, overrides.effect
from public.app_user_module_overrides overrides
join public.app_modules old_dashboard on old_dashboard.id = overrides.module_id
join public.app_modules projects_module on projects_module.slug = 'projects'
where old_dashboard.slug = 'dashboard'
on conflict (user_id, module_id) do update
set effect = excluded.effect;

delete from public.app_role_modules
where module_id in (
  select id from public.app_modules where slug = 'dashboard'
);

delete from public.app_user_module_overrides
where module_id in (
  select id from public.app_modules where slug = 'dashboard'
);
