-- ============================================================================
-- IdeaDump — Database Schema Snapshot
-- Captured: 2026-06-28
-- Source:   Supabase project (xcaxukhjkqqnmzziqrkc)
-- Tables:   16 (all RLS enabled)
-- Rows:     projects=1, daily_logs=171, api_keys=1, DIM_roles=4,
--           DIM_modules=10, BRIDGE_role_modules=29, BRIDGE_user_roles=3
--           (all others = 0 rows)
--
-- This file is a point-in-time snapshot of the live schema, NOT a migration.
-- It captures the actual state of the database including drift from migrations.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Core Application Tables
-- ============================================================================

-- 1. projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  prd_content text,
  github_url text,
  deploy_url text,
  tags text[],
  priority text default 'medium',
  completed boolean default false,
  archived boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 3. tickets
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

-- 4. daily_logs
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('agent', 'human')),
  content jsonb not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. api_keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null,
  name text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 2: RBAC Tables (Dimensional Model)
-- ============================================================================

-- 6. DIM_roles
create table if not exists public.DIM_roles (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  name text not null
);

-- 7. DIM_modules
-- NOTE: 'status' column exists in live DB but has no migration file documenting it.
create table if not exists public.DIM_modules (
  id uuid primary key default gen_random_uuid(),
  modules text not null unique,
  name text not null,
  path text not null
    check (path like '/%' and path not like '//%' and position('://' in path) = 0),
  sort_order integer not null default 100,
  is_managed boolean not null default true,
  is_always_allowed boolean not null default false,
  icon text,
  description text,
  enabled boolean not null default true,
  status text  -- undocumented column; not in any migration
);

-- 8. BRIDGE_role_modules
create table if not exists public.BRIDGE_role_modules (
  role_id uuid not null references public.DIM_roles(id) on delete cascade,
  module_id uuid not null references public.DIM_modules(id) on delete cascade,
  primary key (role_id, module_id)
);

-- 9. BRIDGE_user_roles
create table if not exists public.BRIDGE_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.DIM_roles(id) on delete cascade
);

-- 10. app_user_module_overrides
create table if not exists public.app_user_module_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.DIM_modules(id) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  unique (user_id, module_id)
);

-- ============================================================================
-- SECTION 3: Film Journal Tables
-- ============================================================================

-- 11. film_cameras
create table if not exists public.film_cameras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  model text,
  purchase_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12. film_rolls
-- DRIFT: Migration 20260618 was supposed to add lab_name, processing_cost,
-- scanning_cost, shipping_cost, processing_date — these columns are MISSING
-- from the live DB. The app code (lib/types.ts) expects them.
create table if not exists public.film_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  camera_id uuid references public.film_cameras(id) on delete set null,
  film_name text not null,
  brand text not null,
  format text not null check (format in ('35mm', '120', 'Large Format')),
  iso integer not null check (iso > 0),
  status text not null default 'UNUSED' check (
    status in ('UNUSED', 'LOADED', 'SHOOTING', 'AWAITING_PROCESSING',
               'PROCESSING', 'PROCESSED', 'ARCHIVED')
  ),
  purchase_price numeric(10, 2) not null default 0,
  frames_taken integer not null default 0 check (frames_taken >= 0),
  successful_photos integer not null default 0 check (successful_photos >= 0),
  location_name text,
  notes text,
  drive_folder_id text,
  cover_photo_id uuid,  -- FK added below (self-referential via film_photos)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- cover_photo_id FK (added separately due to circular dependency)
-- alter table public.film_rolls
--   add constraint film_rolls_cover_photo_id_fkey
--   foreign key (cover_photo_id) references public.film_photos(id) on delete set null;

-- 13. film_processing_records
-- ORPHANED: Migration 20260618 was supposed to merge this data into film_rolls
-- and DROP this table. It still exists in the live DB.
create table if not exists public.film_processing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  film_roll_id uuid not null references public.film_rolls(id) on delete cascade,
  lab_name text,
  processing_date date,
  processing_cost numeric(10, 2) not null default 0,
  scanning_cost numeric(10, 2) not null default 0,
  shipping_cost numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. film_maintenance_records
create table if not exists public.film_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  camera_id uuid not null references public.film_cameras(id) on delete cascade,
  service_date date,
  service_type text,
  provider_name text,
  maintenance_cost numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 15. film_photos
create table if not exists public.film_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  film_roll_id uuid not null references public.film_rolls(id) on delete cascade,
  drive_file_id text not null,
  name text not null,
  mime_type text not null,
  web_view_link text,
  thumbnail_link text,
  width integer,
  height integer,
  is_favorite boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (film_roll_id, drive_file_id)
);

-- 16. film_drive_connections
create table if not exists public.film_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz,
  scope text,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 4: Indexes
-- ============================================================================

-- daily_logs
create index if not exists daily_logs_user_date_idx
  on public.daily_logs (user_id, effective_date);
create index if not exists daily_logs_user_created_idx
  on public.daily_logs (user_id, created_at desc);

-- film_cameras
create index if not exists film_cameras_user_id_idx
  on public.film_cameras (user_id);

-- film_rolls
create index if not exists film_rolls_user_id_idx
  on public.film_rolls (user_id);
create index if not exists film_rolls_camera_id_idx
  on public.film_rolls (camera_id);

-- film_maintenance_records
create index if not exists film_maintenance_records_camera_id_idx
  on public.film_maintenance_records (camera_id);
create index if not exists film_maintenance_records_user_id_idx
  on public.film_maintenance_records (user_id);

-- film_photos
create index if not exists film_photos_roll_id_idx
  on public.film_photos (film_roll_id);

-- film_processing_records
create index if not exists film_processing_records_roll_id_idx
  on public.film_processing_records (film_roll_id);

-- ============================================================================
-- SECTION 5: Triggers & Functions
-- ============================================================================

-- tickets updated_at trigger (exists in live DB)
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

-- daily_logs updated_at trigger
-- NOTE: Migration 20260316 defines this trigger, but it does NOT exist in the
-- live DB. Only the function may exist. Left here for reference.
-- create or replace function daily_logs_set_updated_at_fn()
-- returns trigger as $$
-- begin
--   new.updated_at = now();
--   return new;
-- end;
-- $$ language plpgsql;
--
-- create trigger daily_logs_set_updated_at
--   before update on public.daily_logs
--   for each row execute function daily_logs_set_updated_at_fn();

-- ============================================================================
-- SECTION 6: Row Level Security
-- ============================================================================

-- All 16 tables have RLS enabled.
alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.tickets enable row level security;
alter table public.daily_logs enable row level security;
alter table public.api_keys enable row level security;
alter table public.DIM_roles enable row level security;
alter table public.DIM_modules enable row level security;
alter table public.BRIDGE_role_modules enable row level security;
alter table public.BRIDGE_user_roles enable row level security;
alter table public.app_user_module_overrides enable row level security;
alter table public.film_cameras enable row level security;
alter table public.film_rolls enable row level security;
alter table public.film_processing_records enable row level security;
alter table public.film_maintenance_records enable row level security;
alter table public.film_photos enable row level security;
alter table public.film_drive_connections enable row level security;

-- ============================================================================
-- SECTION 7: RLS Policies
-- ============================================================================

-- projects (4 policies)
create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- daily_logs (4 policies)
create policy "Users can view own logs"
  on public.daily_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own logs"
  on public.daily_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own logs"
  on public.daily_logs for update
  using (auth.uid() = user_id);

create policy "Users can delete own logs"
  on public.daily_logs for delete
  using (auth.uid() = user_id);

-- tickets (4 policies)
create policy "Users can view own tickets"
  on public.tickets for select
  using (auth.uid() = user_id);

create policy "Users can insert own tickets"
  on public.tickets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tickets"
  on public.tickets for update
  using (auth.uid() = user_id);

create policy "Users can delete own tickets"
  on public.tickets for delete
  using (auth.uid() = user_id);

-- NOTE: notes, api_keys, and all RBAC/film tables have RLS enabled but
-- NO policies defined. Access is controlled at the application layer via
-- service-role client (admin.ts) or server client with auth context.

-- ============================================================================
-- SECTION 8: Schema Drift Notes
-- ============================================================================
--
-- 1. film_rolls missing 5 columns (HIGH)
--    Migration 20260618_merge_film_processing_into_rolls.sql was not applied.
--    Missing: lab_name, processing_cost, scanning_cost, shipping_cost, processing_date
--    App code (lib/types.ts FilmRoll interface) expects these fields.
--
-- 2. film_processing_records still exists (MEDIUM)
--    Migration 20260618 was supposed to DROP this table after merging data.
--    Table is empty (0 rows) but still present.
--
-- 3. projects.tags column orphaned (LOW)
--    Column exists in DB but is not in TypeScript Project type.
--    No app code reads or writes it.
--
-- 4. DIM_modules.status column undocumented (LOW)
--    Column exists in live DB but no migration file creates it.
--    Not referenced in app code.
--
-- 5. daily_logs updated_at trigger missing (LOW)
--    Migration 20260316 creates this trigger, but it does not exist in live DB.
--    The updated_at column won't auto-update on row modifications.
--
-- 6. DIM_roles has 4 rows but only 3 are defined in migrations (INFO)
--    owner, admin, member are from migrations. 1 additional custom role exists.
