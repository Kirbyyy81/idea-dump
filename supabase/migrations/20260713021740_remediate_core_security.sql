-- Core integrity remediation derived from the reviewed live schema export.
-- This migration deliberately avoids application-domain renames so existing
-- PostgREST relationship names and quoted RBAC identifiers remain compatible.

-- Fail before taking locks if any existing row would be made invalid.
do $preflight$
declare
  violation_count bigint;
begin
  select count(*) into violation_count
  from public.projects
  where user_id is null;
  if violation_count <> 0 then
    raise exception 'Cannot harden projects.user_id: % null rows', violation_count;
  end if;

  select count(*) into violation_count
  from public.notes
  where project_id is null;
  if violation_count <> 0 then
    raise exception 'Cannot harden notes.project_id: % null rows', violation_count;
  end if;

  select count(*) into violation_count
  from public.api_keys
  where user_id is null;
  if violation_count <> 0 then
    raise exception 'Cannot harden api_keys.user_id: % null rows', violation_count;
  end if;

  select count(*) into violation_count
  from public.api_keys
  group by key_hash
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Cannot add unique API-key hash index: duplicate hashes exist';
  end if;

  select count(*) into violation_count
  from public.daily_logs logs
  left join auth.users users on users.id = logs.user_id
  where users.id is null;
  if violation_count <> 0 then
    raise exception 'Cannot add daily_logs auth foreign key: % orphan rows', violation_count;
  end if;

  select count(*) into violation_count
  from public.projects
  where priority is null
     or completed is null
     or archived is null
     or created_at is null
     or updated_at is null;
  if violation_count <> 0 then
    raise exception 'Cannot harden project defaults: % rows contain null defaults', violation_count;
  end if;

  select count(*) into violation_count
  from public.tickets tickets
  join public.projects projects on projects.id = tickets.project_id
  where tickets.user_id <> projects.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe ticket FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_rolls rolls
  join public.film_cameras cameras on cameras.id = rolls.camera_id
  where rolls.user_id <> cameras.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe roll/camera FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_maintenance_records records
  join public.film_cameras cameras on cameras.id = records.camera_id
  where records.user_id <> cameras.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe maintenance/camera FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_photos photos
  join public.film_rolls rolls on rolls.id = photos.film_roll_id
  where photos.user_id <> rolls.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe photo/roll FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_rolls rolls
  join public.film_photos photos on photos.id = rolls.cover_photo_id
  where photos.user_id <> rolls.user_id
     or photos.film_roll_id <> rolls.id;
  if violation_count <> 0 then
    raise exception 'Cannot add same-roll cover FK: % invalid cover relationships', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_rolls
  where purchase_price < 0;
  if violation_count <> 0 then
    raise exception 'Cannot add purchase-price check: % negative values', violation_count;
  end if;

  select count(*) into violation_count
  from public.film_maintenance_records
  where maintenance_cost < 0;
  if violation_count <> 0 then
    raise exception 'Cannot add maintenance-cost check: % negative values', violation_count;
  end if;
end;
$preflight$;

-- Ownership, lifecycle, and default-value hardening.
alter table public.projects
  alter column user_id set not null,
  alter column priority set not null,
  alter column completed set not null,
  alter column archived set not null,
  alter column created_at set not null,
  alter column updated_at set not null,
  add constraint projects_id_user_id_key unique (id, user_id);

alter table public.notes
  alter column project_id set not null;

alter table public.api_keys
  alter column user_id set not null,
  add column revoked_at timestamp with time zone;

create unique index api_keys_key_hash_idx
  on public.api_keys (key_hash);

-- Retained logs become unowned when their Auth user is deleted, as explicitly
-- selected for this product. The application must treat a null user_id as an
-- inaccessible retained record.
alter table public.daily_logs
  alter column user_id drop not null,
  add constraint daily_logs_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete set null;

-- Preserve the existing relationship constraint name while making project
-- ownership part of the ticket relationship.
alter table public.tickets
  drop constraint tickets_project_id_fkey,
  add constraint tickets_project_id_fkey
    foreign key (project_id, user_id)
    references public.projects (id, user_id)
    on delete cascade;

-- Tenant-safe Film relationships. Parent uniqueness is explicit because
-- PostgreSQL foreign keys must target a unique key with the same column set.
alter table public.film_cameras
  add constraint film_cameras_id_user_id_key unique (id, user_id);

alter table public.film_rolls
  add constraint film_rolls_id_user_id_key unique (id, user_id);

alter table public.film_photos
  add constraint film_photos_id_roll_user_key unique (id, film_roll_id, user_id);

alter table public.film_rolls
  drop constraint film_rolls_camera_id_fkey,
  drop constraint film_rolls_cover_photo_id_fkey,
  add constraint film_rolls_camera_id_fkey
    foreign key (camera_id, user_id)
    references public.film_cameras (id, user_id)
    on delete set null (camera_id),
  add constraint film_rolls_cover_photo_id_fkey
    foreign key (cover_photo_id, id, user_id)
    references public.film_photos (id, film_roll_id, user_id)
    on delete set null (cover_photo_id);

alter table public.film_maintenance_records
  drop constraint film_maintenance_records_camera_id_fkey,
  add constraint film_maintenance_records_camera_id_fkey
    foreign key (camera_id, user_id)
    references public.film_cameras (id, user_id)
    on delete cascade;

alter table public.film_photos
  drop constraint film_photos_film_roll_id_fkey,
  add constraint film_photos_film_roll_id_fkey
    foreign key (film_roll_id, user_id)
    references public.film_rolls (id, user_id)
    on delete cascade;

alter table public.film_rolls
  add constraint film_rolls_purchase_price_check
    check (purchase_price >= 0);

alter table public.film_maintenance_records
  add constraint film_maintenance_records_maintenance_cost_check
    check (maintenance_cost >= 0);

-- updated_at remains application-managed. Remove the one database trigger so
-- ticket timestamps follow the same contract as all other mutable tables.
drop trigger if exists tickets_updated_at on public.tickets;
drop function if exists public.update_tickets_updated_at();

-- Cover final foreign-key shapes. Existing indexes are intentionally retained
-- until at least 30 days of representative production statistics are available.
create index app_role_modules_module_id_idx
  on public."BRIDGE_role_modules" (module_id);

create index app_user_roles_role_id_idx
  on public."BRIDGE_user_roles" (role_id);

create index api_keys_user_id_idx
  on public.api_keys (user_id);

create index app_user_module_overrides_module_id_idx
  on public.app_user_module_overrides (module_id);

create index film_rolls_camera_user_idx
  on public.film_rolls (camera_id, user_id);

create index film_rolls_cover_photo_roll_user_idx
  on public.film_rolls (cover_photo_id, id, user_id);

create index film_maintenance_records_camera_user_idx
  on public.film_maintenance_records (camera_id, user_id);

create index film_photos_roll_user_idx
  on public.film_photos (film_roll_id, user_id);

create index film_photos_user_id_idx
  on public.film_photos (user_id);

create index notes_project_id_idx
  on public.notes (project_id);

create index projects_user_id_idx
  on public.projects (user_id);

create index tickets_project_user_idx
  on public.tickets (project_id, user_id);

create index tickets_user_id_idx
  on public.tickets (user_id);
