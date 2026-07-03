-- Seed data for local Supabase test databases.
-- This seed follows tests/db/schema.current.sql, not document/migrations/*.

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.test',
    crypt('password123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Test Owner"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'admin@example.test',
    crypt('password123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Test Admin"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'member@example.test',
    crypt('password123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Test Member"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.DIM_roles (id, role, name) values
  ('01000000-0000-0000-0000-000000000001', 'owner', 'Owner'),
  ('01000000-0000-0000-0000-000000000002', 'admin', 'Admin'),
  ('01000000-0000-0000-0000-000000000003', 'member', 'Member')
on conflict (role) do update set name = excluded.name;

insert into public.DIM_modules (
  id,
  modules,
  name,
  path,
  sort_order,
  is_managed,
  is_always_allowed,
  icon,
  description,
  enabled,
  status
) values
  ('02000000-0000-0000-0000-000000000001', 'dashboard', 'Dashboard', '/dashboard', 10, false, true, 'LayoutDashboard', 'Overview', true, null),
  ('02000000-0000-0000-0000-000000000002', 'projects', 'Projects', '/projects', 20, true, false, 'FolderKanban', 'Project tracking', true, null),
  ('02000000-0000-0000-0000-000000000003', 'tickets', 'Tickets', '/tickets', 30, true, false, 'Tickets', 'Ticket tracking', true, null),
  ('02000000-0000-0000-0000-000000000004', 'logs', 'Logs', '/logs', 40, true, false, 'BookOpen', 'Daily logs', true, null),
  ('02000000-0000-0000-0000-000000000005', 'log_viewer', 'Log Viewer', '/log-viewer', 50, true, false, 'FileText', 'System log viewer', true, null),
  ('02000000-0000-0000-0000-000000000006', 'api', 'API', '/api-tools', 60, true, false, 'KeyRound', 'API tools', true, null),
  ('02000000-0000-0000-0000-000000000007', 'access_control', 'Access Control', '/settings/access', 70, true, false, 'Shield', 'RBAC management', true, null),
  ('02000000-0000-0000-0000-000000000008', 'article_creation', 'Article Creation', '/article-creation', 80, true, false, 'Newspaper', 'Article helpers', true, null),
  ('02000000-0000-0000-0000-000000000009', 'film_journal', 'Film Journal', '/film', 90, true, false, 'Camera', 'Film journal', true, null),
  ('02000000-0000-0000-0000-000000000010', 'settings', 'Settings', '/settings', 100, false, true, 'Settings', 'User settings', true, null)
on conflict (modules) do update set
  name = excluded.name,
  path = excluded.path,
  sort_order = excluded.sort_order,
  is_managed = excluded.is_managed,
  is_always_allowed = excluded.is_always_allowed,
  icon = excluded.icon,
  description = excluded.description,
  enabled = excluded.enabled,
  status = excluded.status;

insert into public.BRIDGE_user_roles (user_id, role_id) values
  ('00000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003', '01000000-0000-0000-0000-000000000003')
on conflict (user_id) do update set role_id = excluded.role_id;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role.id, module.id
from public.DIM_roles role
cross join public.DIM_modules module
where role.role = 'owner'
on conflict do nothing;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role.id, module.id
from public.DIM_roles role
join public.DIM_modules module on module.modules in ('projects', 'tickets', 'logs', 'log_viewer', 'api', 'article_creation', 'film_journal')
where role.role = 'admin'
on conflict do nothing;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role.id, module.id
from public.DIM_roles role
join public.DIM_modules module on module.modules in ('projects', 'tickets', 'logs')
where role.role = 'member'
on conflict do nothing;

insert into public.projects (
  id,
  user_id,
  title,
  description,
  prd_content,
  github_url,
  deploy_url,
  tags,
  priority,
  completed,
  archived,
  created_at,
  updated_at
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Seed Project',
  'Project used by full-stack tests',
  '# Seed Project',
  null,
  null,
  '{}',
  'medium',
  false,
  false,
  now(),
  now()
) on conflict (id) do nothing;

insert into public.daily_logs (
  id,
  user_id,
  source,
  content,
  effective_date,
  created_at,
  updated_at
) values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'human',
  '{"date":"2026-07-03","operation_task":"QA framework setup","tools_used":"Vitest, Playwright, Supabase"}'::jsonb,
  '2026-07-03',
  now(),
  now()
) on conflict (id) do nothing;

insert into public.film_cameras (
  id,
  user_id,
  name,
  brand,
  model,
  created_at,
  updated_at
) values (
  '31000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Seed Camera',
  'Nikon',
  'FM2',
  now(),
  now()
) on conflict (id) do nothing;

insert into public.film_rolls (
  id,
  user_id,
  camera_id,
  film_name,
  brand,
  format,
  iso,
  status,
  purchase_price,
  frames_taken,
  successful_photos,
  location_name,
  notes,
  drive_folder_id,
  cover_photo_id,
  created_at,
  updated_at
) values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'Portra 400',
  'Kodak',
  '35mm',
  400,
  'UNUSED',
  18,
  0,
  0,
  null,
  null,
  null,
  null,
  now(),
  now()
) on conflict (id) do nothing;
