insert into public.DIM_modules (modules, name)
values ('film_journal', 'Film Journal')
on conflict (modules) do update
set name = excluded.name;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role_rows.id, module_rows.id
from public.DIM_roles role_rows
join public.DIM_modules module_rows on module_rows.modules = 'film_journal'
where role_rows.role in ('owner', 'admin', 'member')
on conflict do nothing;

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

create table if not exists public.film_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  camera_id uuid references public.film_cameras(id) on delete set null,
  film_name text not null,
  brand text not null,
  format text not null check (format in ('35mm', '120', 'Large Format')),
  iso integer not null check (iso > 0),
  status text not null default 'UNUSED' check (
    status in (
      'UNUSED',
      'LOADED',
      'SHOOTING',
      'AWAITING_PROCESSING',
      'PROCESSING',
      'PROCESSED',
      'ARCHIVED'
    )
  ),
  purchase_price numeric(10, 2) not null default 0,
  location_name text,
  frames_taken integer not null default 0 check (frames_taken >= 0),
  successful_photos integer not null default 0 check (successful_photos >= 0),
  notes text,
  drive_folder_id text,
  cover_photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.film_processing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  film_roll_id uuid not null references public.film_rolls(id) on delete cascade,
  lab_name text,
  processing_cost numeric(10, 2) not null default 0,
  scanning_cost numeric(10, 2) not null default 0,
  shipping_cost numeric(10, 2) not null default 0,
  processing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'film_rolls_cover_photo_id_fkey'
  ) then
    alter table public.film_rolls
    add constraint film_rolls_cover_photo_id_fkey
    foreign key (cover_photo_id) references public.film_photos(id) on delete set null;
  end if;
end $$;

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

create index if not exists film_cameras_user_id_idx on public.film_cameras(user_id);
create index if not exists film_rolls_user_id_idx on public.film_rolls(user_id);
create index if not exists film_rolls_camera_id_idx on public.film_rolls(camera_id);
create index if not exists film_processing_records_roll_id_idx on public.film_processing_records(film_roll_id);
create index if not exists film_maintenance_records_camera_id_idx on public.film_maintenance_records(camera_id);
create index if not exists film_maintenance_records_user_id_idx on public.film_maintenance_records(user_id);
create index if not exists film_photos_roll_id_idx on public.film_photos(film_roll_id);
