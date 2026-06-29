alter table public."DIM_modules"
  add column if not exists path text,
  add column if not exists sort_order integer not null default 100,
  add column if not exists is_managed boolean not null default true,
  add column if not exists is_always_allowed boolean not null default false,
  add column if not exists icon text,
  add column if not exists description text,
  add column if not exists enabled boolean not null default true;

update public."DIM_modules"
set
  path = values.path,
  sort_order = values.sort_order,
  is_managed = values.is_managed,
  is_always_allowed = values.is_always_allowed,
  icon = values.icon,
  description = values.description,
  name = values.name,
  enabled = true
from (
  values
    ('dashboard', 'Dashboard', '/dashboard', 0, false, true, 'LayoutDashboard', 'Review your available modules and jump into the areas you can access.'),
    ('projects', 'Projects', '/projects', 10, true, false, 'FolderKanban', 'Manage project records and open individual project detail pages.'),
    ('tickets', 'Tickets', '/tickets', 20, true, false, 'Ticket', 'Raise tickets, review your own queue, and manage ticket workflows across the workspace.'),
    ('logs', 'Weekly Logs', '/logs', 30, true, false, 'ClipboardList', 'View, add, edit, and export your weekly productivity logs.'),
    ('log_viewer', 'Log Viewer', '/log-viewer', 40, true, false, 'FileSearch', 'Search and review captured logs across the workspace.'),
    ('film_journal', 'Film Journal', '/film', 50, true, false, 'Film', 'Browse film rolls as a journal, open photobook entries, and review shooting costs.'),
    ('api', 'API Docs', '/docs', 60, true, false, 'BookOpen', 'Review the generated API reference and endpoint documentation.'),
    ('access_control', 'Access Control', '/settings/access', 70, true, false, 'ShieldCheck', 'Manage roles, module access, and user-specific exceptions.'),
    ('article_creation', 'Article Creation', '/article-creation', 80, true, false, 'FilePenLine', 'Use the built-in helpers for article planning and content support.'),
    ('settings', 'Settings', '/settings', 90, false, true, 'Settings', 'Manage your personal account settings and sign-out actions.')
) as values(module_slug, name, path, sort_order, is_managed, is_always_allowed, icon, description)
where public."DIM_modules".modules = values.module_slug;

alter table public."DIM_modules"
  alter column path set not null;

alter table public."DIM_modules"
  drop constraint if exists dim_modules_safe_path;

alter table public."DIM_modules"
  add constraint dim_modules_safe_path
  check (
    path like '/%'
    and path not like '//%'
    and position('://' in path) = 0
  );
