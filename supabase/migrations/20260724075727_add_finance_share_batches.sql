-- PRD 009: durable Android share-to-Finance handoff.
--
-- The queue and operational tables are deliberately outside the exposed
-- schemas. Browser clients interact only through authenticated Next.js routes;
-- Render and Next.js use narrowly granted public RPC wrappers as service_role.

create extension if not exists pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

do $queue$
begin
  if pg_catalog.to_regclass('pgmq.q_finance_share_ocr') is null then
    perform pgmq.create('finance_share_ocr');
  end if;
end;
$queue$;

revoke all on schema pgmq from public, anon, authenticated;
grant usage on schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role;

create schema if not exists finance_private;
revoke all on schema finance_private from public, anon, authenticated;
grant usage on schema finance_private to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'finance-share-batches',
  'finance-share-batches',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table finance_private.finance_share_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'committing', 'cleaning_up')),
  total_files integer not null check (total_files between 1 and 10),
  expires_at timestamp with time zone not null,
  cleanup_attempt_id uuid,
  cleanup_started_at timestamp with time zone,
  cleanup_lease_expires_at timestamp with time zone,
  cleanup_attempt_count integer not null default 0
    check (cleanup_attempt_count >= 0),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, batch_id, user_id),
  unique (user_id, request_id),
  check (
    (
      status = 'cleaning_up'
      and cleanup_attempt_id is not null
      and cleanup_started_at is not null
      and cleanup_lease_expires_at > cleanup_started_at
    )
    or (
      status <> 'cleaning_up'
      and cleanup_attempt_id is null
      and cleanup_started_at is null
      and cleanup_lease_expires_at is null
    )
  )
);

create index finance_share_upload_reservations_expiry_idx
  on finance_private.finance_share_upload_reservations (status, expires_at);

create index finance_share_upload_reservations_user_idx
  on finance_private.finance_share_upload_reservations (user_id, created_at desc);

create table finance_private.finance_share_upload_reservation_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  reservation_id uuid not null,
  batch_id uuid not null,
  user_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size between 1 and 4194304),
  created_at timestamp with time zone not null default now(),
  foreign key (reservation_id, batch_id, user_id)
    references finance_private.finance_share_upload_reservations (id, batch_id, user_id)
    on delete cascade,
  unique (reservation_id, client_id),
  check (
    storage_path = user_id::text
      || '/finance-share-batches/'
      || batch_id::text
      || '/'
      || id::text
      || '/original.'
      || case mime_type
        when 'image/png' then 'png'
        when 'image/jpeg' then 'jpg'
        when 'image/webp' then 'webp'
      end
  ),
  check (
    pg_catalog.char_length(pg_catalog.btrim(original_filename)) between 1 and 255
    and original_filename !~ '[[:cntrl:]]'
  )
);

create index finance_share_upload_reservation_items_reservation_idx
  on finance_private.finance_share_upload_reservation_items (reservation_id, created_at, id);

create table finance_private.finance_share_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'cleaning_up')),
  total_files integer not null check (total_files between 1 and 10),
  queued_files integer not null check (queued_files >= 0),
  processing_files integer not null check (processing_files >= 0),
  completed_files integer not null check (completed_files >= 0),
  review_files integer not null check (review_files >= 0),
  duplicate_files integer not null check (duplicate_files >= 0),
  failed_files integer not null check (failed_files >= 0),
  processing_version integer not null check (processing_version >= 1),
  cleanup_attempt_id uuid,
  cleanup_started_at timestamp with time zone,
  cleanup_lease_expires_at timestamp with time zone,
  cleanup_attempt_count integer not null default 0
    check (cleanup_attempt_count >= 0),
  cleanup_failure_code text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, user_id),
  check (
    queued_files
      + processing_files
      + completed_files
      + review_files
      + duplicate_files
      + failed_files
      = total_files
  ),
  check (
    (
      status = 'cleaning_up'
      and queued_files = 0
      and processing_files = 0
      and cleanup_attempt_id is not null
      and cleanup_started_at is not null
      and cleanup_lease_expires_at > cleanup_started_at
    )
    or (
      status <> 'cleaning_up'
      and cleanup_attempt_id is null
      and cleanup_started_at is null
      and cleanup_lease_expires_at is null
    )
  ),
  check (
    cleanup_failure_code is null
    or cleanup_failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'
  )
);

create index finance_share_batches_user_created_idx
  on finance_private.finance_share_batches (user_id, created_at desc);

create index finance_share_batches_recovery_idx
  on finance_private.finance_share_batches (status, cleanup_lease_expires_at, updated_at);

create table finance_private.finance_share_batch_items (
  id uuid primary key,
  batch_id uuid not null,
  user_id uuid not null,
  intake_item_id uuid,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size between 1 and 4194304),
  status text not null default 'queued'
    check (
      status in (
        'queued',
        'processing',
        'auto_confirmed',
        'review_required',
        'duplicate',
        'failed'
      )
    ),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 2),
  processing_attempt_id uuid,
  processing_started_at timestamp with time zone,
  processing_lease_expires_at timestamp with time zone,
  processing_version integer not null check (processing_version >= 1),
  queue_message_id bigint not null unique,
  exact_image_duplicate boolean not null default false,
  image_hash text,
  intake_processing_attempt_id uuid,
  failure_code text,
  failure_stage text,
  terminal_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (batch_id, user_id)
    references finance_private.finance_share_batches (id, user_id)
    on delete cascade,
  foreign key (intake_item_id, user_id)
    references public.finance_intake_items (id, user_id),
  check (
    storage_path = user_id::text
      || '/finance-share-batches/'
      || batch_id::text
      || '/'
      || id::text
      || '/original.'
      || case mime_type
        when 'image/png' then 'png'
        when 'image/jpeg' then 'jpg'
        when 'image/webp' then 'webp'
      end
  ),
  check (
    pg_catalog.char_length(pg_catalog.btrim(original_filename)) between 1 and 255
    and original_filename !~ '[[:cntrl:]]'
  ),
  check (
    (
      status = 'queued'
      and attempt_count = 0
      and processing_attempt_id is null
      and processing_started_at is null
      and processing_lease_expires_at is null
      and terminal_at is null
    )
    or (
      status = 'processing'
      and attempt_count between 1 and 2
      and processing_attempt_id is not null
      and processing_started_at is not null
      and processing_lease_expires_at > processing_started_at
      and terminal_at is null
    )
    or (
      status in ('auto_confirmed', 'review_required', 'duplicate', 'failed')
      and attempt_count between 1 and 2
      and processing_attempt_id is not null
      and processing_lease_expires_at is null
      and terminal_at is not null
    )
  ),
  check (
    failure_code is null
    or failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'
  ),
  check (
    image_hash is null
    or image_hash ~ '^[0-9a-f]{64}$'
  ),
  check (
    failure_stage is null
    or failure_stage ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

create index finance_share_batch_items_batch_status_idx
  on finance_private.finance_share_batch_items (batch_id, status, created_at, id);

create index finance_share_batch_items_user_status_idx
  on finance_private.finance_share_batch_items (user_id, status, created_at desc);

create index finance_share_batch_items_stale_idx
  on finance_private.finance_share_batch_items (processing_lease_expires_at)
  where status = 'processing';

alter table finance_private.finance_share_upload_reservations enable row level security;
alter table finance_private.finance_share_upload_reservation_items enable row level security;
alter table finance_private.finance_share_batches enable row level security;
alter table finance_private.finance_share_batch_items enable row level security;

create policy server_only_deny
on finance_private.finance_share_upload_reservations
as restrictive for all to anon, authenticated
using (false) with check (false);

create policy server_only_deny
on finance_private.finance_share_upload_reservation_items
as restrictive for all to anon, authenticated
using (false) with check (false);

create policy server_only_deny
on finance_private.finance_share_batches
as restrictive for all to anon, authenticated
using (false) with check (false);

create policy server_only_deny
on finance_private.finance_share_batch_items
as restrictive for all to anon, authenticated
using (false) with check (false);

revoke all on all tables in schema finance_private
  from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema finance_private
  to service_role;

alter default privileges for role postgres in schema finance_private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema finance_private
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema finance_private
  revoke execute on functions from public, anon, authenticated;

create function finance_private.finance_share_active_batch_exists_v1(
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from finance_private.finance_share_batches batches
    where batches.user_id = p_user_id
  );
$function$;

create function finance_private.finance_share_reservation_json_v1(
  p_reservation_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'reservation_id', reservations.id,
    'batch_id', reservations.batch_id,
    'expires_at', reservations.expires_at,
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', items.id,
            'client_id', items.client_id,
            'storage_path', items.storage_path,
            'original_filename', items.original_filename,
            'mime_type', items.mime_type,
            'file_size', items.file_size
          )
          order by items.created_at, items.id
        )
        from finance_private.finance_share_upload_reservation_items items
        where items.reservation_id = reservations.id
      ),
      '[]'::jsonb
    )
  )
  from finance_private.finance_share_upload_reservations reservations
  where reservations.id = p_reservation_id;
$function$;

create function finance_private.finance_share_batch_json_v1(
  p_batch_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'id', batches.id,
    'status', pg_catalog.upper(batches.status),
    'total_files', batches.total_files,
    'queued_files', batches.queued_files,
    'processing_files', batches.processing_files,
    'completed_files', batches.completed_files,
    'review_files', batches.review_files,
    'duplicate_files', batches.duplicate_files,
    'failed_files', batches.failed_files,
    'created_at', batches.created_at,
    'updated_at', batches.updated_at,
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_strip_nulls(
            pg_catalog.jsonb_build_object(
              'id', items.id,
              'intake_item_id', items.intake_item_id,
              'original_filename', items.original_filename,
              'status', pg_catalog.upper(items.status),
              'attempt_count', items.attempt_count,
              'failure_code', items.failure_code,
              'failure_stage', items.failure_stage,
              'created_at', items.created_at,
              'updated_at', items.updated_at
            )
          )
          order by items.created_at, items.id
        )
        from finance_private.finance_share_batch_items items
        where items.batch_id = batches.id
      ),
      '[]'::jsonb
    )
  )
  from finance_private.finance_share_batches batches
  where batches.id = p_batch_id;
$function$;

create function finance_private.finance_recount_share_batch_v1(
  p_batch_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  update finance_private.finance_share_batches batches
  set queued_files = counts.queued_files,
      processing_files = counts.processing_files,
      completed_files = counts.completed_files,
      review_files = counts.review_files,
      duplicate_files = counts.duplicate_files,
      failed_files = counts.failed_files,
      status = case
        when counts.queued_files = 0 and counts.processing_files = 0
          then 'cleaning_up'
        when counts.processing_files > 0
          then 'processing'
        else 'queued'
      end,
      cleanup_attempt_id = case
        when counts.queued_files = 0 and counts.processing_files = 0
          then coalesce(batches.cleanup_attempt_id, pg_catalog.gen_random_uuid())
        else null
      end,
      cleanup_started_at = case
        when counts.queued_files = 0 and counts.processing_files = 0
          then coalesce(batches.cleanup_started_at, pg_catalog.clock_timestamp())
        else null
      end,
      cleanup_lease_expires_at = case
        when counts.queued_files = 0 and counts.processing_files = 0
          then coalesce(
            batches.cleanup_lease_expires_at,
            pg_catalog.clock_timestamp() + interval '10 minutes'
          )
        else null
      end,
      cleanup_attempt_count = case
        when counts.queued_files = 0
          and counts.processing_files = 0
          and batches.status <> 'cleaning_up'
          then batches.cleanup_attempt_count + 1
        else batches.cleanup_attempt_count
      end,
      updated_at = pg_catalog.clock_timestamp()
  from (
    select
      count(*) filter (where items.status = 'queued')::integer as queued_files,
      count(*) filter (where items.status = 'processing')::integer as processing_files,
      count(*) filter (where items.status = 'auto_confirmed')::integer as completed_files,
      count(*) filter (where items.status = 'review_required')::integer as review_files,
      count(*) filter (where items.status = 'duplicate')::integer as duplicate_files,
      count(*) filter (where items.status = 'failed')::integer as failed_files
    from finance_private.finance_share_batch_items items
    where items.batch_id = p_batch_id
  ) counts
  where batches.id = p_batch_id;
end;
$function$;

create function public.finance_prepare_share_batch_v1(
  p_user_id uuid,
  p_request_id uuid,
  p_files jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  reservation_row finance_private.finance_share_upload_reservations%rowtype;
  file_row jsonb;
  item_client_id uuid;
  item_id uuid;
  item_mime text;
  item_name text;
  item_size bigint;
  item_extension text;
  item_path text;
  file_count integer;
begin
  if p_user_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id, 'finance'), false) then
    raise exception using errcode = '42501', message = 'FINANCE_SHARE_ACCESS_DENIED';
  end if;
  if p_files is null or pg_catalog.jsonb_typeof(p_files) <> 'array' then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILES';
  end if;

  file_count := pg_catalog.jsonb_array_length(p_files);
  if file_count not between 1 and 10 then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILE_COUNT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-share-active:' || p_user_id::text,
      0
    )
  );

  select * into reservation_row
  from finance_private.finance_share_upload_reservations reservations
  where reservations.user_id = p_user_id
    and reservations.request_id = p_request_id
  for update;

  if found then
    if reservation_row.status <> 'uploading'
       or reservation_row.expires_at <= pg_catalog.clock_timestamp() then
      raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_RESERVATION_EXPIRED';
    end if;
    return finance_private.finance_share_reservation_json_v1(reservation_row.id);
  end if;

  if finance_private.finance_share_active_batch_exists_v1(p_user_id) then
    raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_ACTIVE_BATCH_EXISTS';
  end if;

  if exists (
    select 1
    from finance_private.finance_share_upload_reservations reservations
    where reservations.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_UPLOAD_IN_PROGRESS';
  end if;

  insert into finance_private.finance_share_upload_reservations (
    user_id,
    request_id,
    total_files,
    expires_at
  ) values (
    p_user_id,
    p_request_id,
    file_count,
    pg_catalog.clock_timestamp() + interval '2 hours'
  )
  returning * into reservation_row;

  for file_row in
    select value
    from pg_catalog.jsonb_array_elements(p_files)
  loop
    if pg_catalog.jsonb_typeof(file_row) <> 'object' then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILE';
    end if;

    item_name := pg_catalog.btrim(file_row ->> 'original_filename');
    item_mime := pg_catalog.btrim(file_row ->> 'mime_type');
    begin
      item_client_id := (file_row ->> 'client_id')::uuid;
      item_size := (file_row ->> 'file_size')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILE';
    end;

    if item_client_id is null then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILE';
    end if;
    if item_name is null
       or pg_catalog.char_length(item_name) not between 1 and 255
       or item_name ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILENAME';
    end if;
    if item_mime not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_MIME_TYPE';
    end if;
    if item_size not between 1 and 4194304 then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FILE_SIZE';
    end if;

    item_id := pg_catalog.gen_random_uuid();
    item_extension := case item_mime
      when 'image/png' then 'png'
      when 'image/jpeg' then 'jpg'
      when 'image/webp' then 'webp'
    end;
    item_path := p_user_id::text
      || '/finance-share-batches/'
      || reservation_row.batch_id::text
      || '/'
      || item_id::text
      || '/original.'
      || item_extension;

    insert into finance_private.finance_share_upload_reservation_items (
      id,
      client_id,
      reservation_id,
      batch_id,
      user_id,
      storage_path,
      original_filename,
      mime_type,
      file_size
    ) values (
      item_id,
      item_client_id,
      reservation_row.id,
      reservation_row.batch_id,
      p_user_id,
      item_path,
      item_name,
      item_mime,
      item_size
    );
  end loop;

  return finance_private.finance_share_reservation_json_v1(reservation_row.id);
end;
$function$;

create function public.finance_get_share_upload_reservation_v1(
  p_user_id uuid,
  p_reservation_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  reservation_row finance_private.finance_share_upload_reservations%rowtype;
begin
  if p_user_id is null or p_reservation_id is null or p_batch_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id, 'finance'), false) then
    raise exception using errcode = '42501', message = 'FINANCE_SHARE_ACCESS_DENIED';
  end if;

  select * into reservation_row
  from finance_private.finance_share_upload_reservations reservations
  where reservations.id = p_reservation_id
    and reservations.batch_id = p_batch_id
    and reservations.user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'FINANCE_SHARE_RESERVATION_NOT_FOUND';
  end if;

  return finance_private.finance_share_reservation_json_v1(reservation_row.id);
end;
$function$;

create function public.finance_commit_share_batch_v1(
  p_user_id uuid,
  p_reservation_id uuid,
  p_batch_id uuid,
  p_verified_item_ids uuid[],
  p_processing_version integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  reservation_row finance_private.finance_share_upload_reservations%rowtype;
  reservation_item finance_private.finance_share_upload_reservation_items%rowtype;
  existing_batch finance_private.finance_share_batches%rowtype;
  message_id bigint;
  verified_count integer;
begin
  if p_user_id is null
     or p_reservation_id is null
     or p_batch_id is null
     or p_processing_version is null
     or p_processing_version < 1 then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id, 'finance'), false) then
    raise exception using errcode = '42501', message = 'FINANCE_SHARE_ACCESS_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-share-active:' || p_user_id::text,
      0
    )
  );

  select * into existing_batch
  from finance_private.finance_share_batches batches
  where batches.id = p_batch_id
    and batches.user_id = p_user_id
  for update;

  if found then
    return finance_private.finance_share_batch_json_v1(existing_batch.id);
  end if;

  if finance_private.finance_share_active_batch_exists_v1(p_user_id) then
    raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_ACTIVE_BATCH_EXISTS';
  end if;

  select * into reservation_row
  from finance_private.finance_share_upload_reservations reservations
  where reservations.id = p_reservation_id
    and reservations.batch_id = p_batch_id
    and reservations.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'FINANCE_SHARE_RESERVATION_NOT_FOUND';
  end if;
  if reservation_row.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_RESERVATION_EXPIRED';
  end if;
  if reservation_row.status not in ('uploading', 'committing') then
    raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_RESERVATION_UNAVAILABLE';
  end if;

  select count(distinct verified_id)::integer into verified_count
  from pg_catalog.unnest(coalesce(p_verified_item_ids, '{}'::uuid[])) verified_id;

  if verified_count <> reservation_row.total_files
     or pg_catalog.cardinality(coalesce(p_verified_item_ids, '{}'::uuid[]))
        <> reservation_row.total_files
     or exists (
       select 1
       from finance_private.finance_share_upload_reservation_items items
       where items.reservation_id = reservation_row.id
         and not (items.id = any (p_verified_item_ids))
     ) then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_UPLOADS_NOT_VERIFIED';
  end if;

  update finance_private.finance_share_upload_reservations
  set status = 'committing',
      updated_at = pg_catalog.clock_timestamp()
  where id = reservation_row.id;

  insert into finance_private.finance_share_batches (
    id,
    user_id,
    status,
    total_files,
    queued_files,
    processing_files,
    completed_files,
    review_files,
    duplicate_files,
    failed_files,
    processing_version
  ) values (
    reservation_row.batch_id,
    p_user_id,
    'queued',
    reservation_row.total_files,
    reservation_row.total_files,
    0,
    0,
    0,
    0,
    0,
    p_processing_version
  );

  for reservation_item in
    select *
    from finance_private.finance_share_upload_reservation_items items
    where items.reservation_id = reservation_row.id
    order by items.created_at, items.id
  loop
    select sent_message_id into message_id
    from pgmq.send(
      'finance_share_ocr',
      pg_catalog.jsonb_build_object(
        'batchId', reservation_row.batch_id,
        'batchItemId', reservation_item.id,
        'processingVersion', p_processing_version
      ),
      0
    ) sent_message_id;

    if message_id is null then
      raise exception using errcode = 'P0001', message = 'FINANCE_SHARE_QUEUE_UNAVAILABLE';
    end if;

    insert into finance_private.finance_share_batch_items (
      id,
      batch_id,
      user_id,
      storage_path,
      original_filename,
      mime_type,
      file_size,
      processing_version,
      queue_message_id
    ) values (
      reservation_item.id,
      reservation_row.batch_id,
      p_user_id,
      reservation_item.storage_path,
      reservation_item.original_filename,
      reservation_item.mime_type,
      reservation_item.file_size,
      p_processing_version,
      message_id
    );
  end loop;

  delete from finance_private.finance_share_upload_reservations
  where id = reservation_row.id;

  return finance_private.finance_share_batch_json_v1(reservation_row.batch_id);
end;
$function$;

create function public.finance_get_active_share_batch_v1(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  batch_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id, 'finance'), false) then
    raise exception using errcode = '42501', message = 'FINANCE_SHARE_ACCESS_DENIED';
  end if;

  select batches.id into batch_id
  from finance_private.finance_share_batches batches
  where batches.user_id = p_user_id
  order by batches.created_at desc, batches.id
  limit 1;

  if batch_id is null then
    return null;
  end if;
  return finance_private.finance_share_batch_json_v1(batch_id);
end;
$function$;

create function finance_private.finance_share_queue_item_json_v1(
  p_item_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'id', items.id,
      'batch_id', items.batch_id,
      'user_id', items.user_id,
      'intake_item_id', items.intake_item_id,
      'image_hash', items.image_hash,
      'storage_path', items.storage_path,
      'original_filename', items.original_filename,
      'mime_type', items.mime_type,
      'file_size', items.file_size,
      'status', items.status,
      'attempt_count', items.attempt_count,
      'processing_attempt_id', items.processing_attempt_id,
      'processing_version', items.processing_version,
      'exact_image_duplicate', items.exact_image_duplicate,
      'intake_processing_attempt_id', items.intake_processing_attempt_id
    )
  )
  from finance_private.finance_share_batch_items items
  where items.id = p_item_id;
$function$;

create function public.finance_claim_share_queue_item_v1(
  p_processing_version integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  reservation_row finance_private.finance_share_upload_reservations%rowtype;
  batch_row finance_private.finance_share_batches%rowtype;
  item_row finance_private.finance_share_batch_items%rowtype;
  queue_row record;
  queue_batch_id uuid;
  queue_item_id uuid;
  queue_processing_version integer;
  attempt_id uuid;
  next_attempt_count integer;
  was_exhausted boolean;
  lease_now timestamp with time zone := pg_catalog.clock_timestamp();
  cleanup_paths jsonb;
  access_allowed boolean;
  terminal_reason text;
  terminal_outcome text;
  terminal_intake public.finance_intake_items%rowtype;
  terminal_candidate public.finance_candidate_transactions%rowtype;
  terminal_transaction public.finance_transactions%rowtype;
  completion_result jsonb;
begin
  if p_processing_version is null or p_processing_version < 1 then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_PROCESSING_VERSION';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_LEASE';
  end if;

  -- Confirmed uploads that never reached the queue transaction still need
  -- authorized cleanup after their signed-upload reservation expires.
  select * into reservation_row
  from finance_private.finance_share_upload_reservations reservations
  where reservations.expires_at <= lease_now
    and (
      reservations.status <> 'cleaning_up'
      or reservations.cleanup_lease_expires_at <= lease_now
    )
  order by reservations.expires_at, reservations.id
  for update skip locked
  limit 1;

  if found then
    attempt_id := pg_catalog.gen_random_uuid();
    update finance_private.finance_share_upload_reservations
    set status = 'cleaning_up',
        cleanup_attempt_id = attempt_id,
        cleanup_started_at = lease_now,
        cleanup_lease_expires_at = lease_now
          + pg_catalog.make_interval(secs => p_lease_seconds),
        cleanup_attempt_count = cleanup_attempt_count + 1,
        updated_at = lease_now
    where id = reservation_row.id
    returning * into reservation_row;

    select coalesce(
      pg_catalog.jsonb_agg(items.storage_path order by items.created_at, items.id),
      '[]'::jsonb
    ) into cleanup_paths
    from finance_private.finance_share_upload_reservation_items items
    where items.reservation_id = reservation_row.id;

    return pg_catalog.jsonb_build_object(
      'state', 'reservation_cleanup',
      'cleanup', pg_catalog.jsonb_build_object(
        'batch_id', reservation_row.batch_id,
        'cleanup_attempt_id', reservation_row.cleanup_attempt_id,
        'storage_paths', cleanup_paths
      )
    );
  end if;

  -- A terminal batch can be recovered even after every item message has been
  -- deleted and the Render process stopped before Storage cleanup.
  select * into batch_row
  from finance_private.finance_share_batches batches
  where batches.status = 'cleaning_up'
    and (
      batches.cleanup_lease_expires_at is null
      or batches.cleanup_lease_expires_at <= lease_now
    )
  order by batches.updated_at, batches.id
  for update skip locked
  limit 1;

  if found then
    attempt_id := pg_catalog.gen_random_uuid();
    update finance_private.finance_share_batches
    set cleanup_attempt_id = attempt_id,
        cleanup_started_at = lease_now,
        cleanup_lease_expires_at = lease_now
          + pg_catalog.make_interval(secs => p_lease_seconds),
        cleanup_attempt_count = cleanup_attempt_count + 1,
        cleanup_failure_code = null,
        updated_at = lease_now
    where id = batch_row.id
    returning * into batch_row;

    select coalesce(
      pg_catalog.jsonb_agg(items.storage_path order by items.created_at, items.id),
      '[]'::jsonb
    ) into cleanup_paths
    from finance_private.finance_share_batch_items items
    where items.batch_id = batch_row.id;

    return pg_catalog.jsonb_build_object(
      'state', 'cleanup',
      'cleanup', pg_catalog.jsonb_build_object(
        'batch_id', batch_row.id,
        'cleanup_attempt_id', batch_row.cleanup_attempt_id,
        'storage_paths', cleanup_paths
      )
    );
  end if;

  select *
  into queue_row
  from pgmq.read('finance_share_ocr', p_lease_seconds, 1)
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('state', 'empty');
  end if;

  begin
    queue_batch_id := (queue_row.message ->> 'batchId')::uuid;
    queue_item_id := (queue_row.message ->> 'batchItemId')::uuid;
    queue_processing_version := (queue_row.message ->> 'processingVersion')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      perform pgmq.delete('finance_share_ocr', queue_row.msg_id);
      return pg_catalog.jsonb_build_object(
        'state', 'discarded',
        'message_id', queue_row.msg_id,
        'reason', 'invalid_message'
      );
  end;

  if queue_batch_id is null
     or queue_item_id is null
     or queue_processing_version is null then
    perform pgmq.delete('finance_share_ocr', queue_row.msg_id);
    return pg_catalog.jsonb_build_object(
      'state', 'discarded',
      'message_id', queue_row.msg_id,
      'reason', 'incomplete_message'
    );
  end if;

  select * into item_row
  from finance_private.finance_share_batch_items items
  where items.id = queue_item_id
    and items.batch_id = queue_batch_id
    and items.queue_message_id = queue_row.msg_id
  for update;

  if not found then
    perform pgmq.delete('finance_share_ocr', queue_row.msg_id);
    return pg_catalog.jsonb_build_object(
      'state', 'discarded',
      'message_id', queue_row.msg_id,
      'reason', 'item_not_found'
    );
  end if;

  select * into batch_row
  from finance_private.finance_share_batches batches
  where batches.id = item_row.batch_id
    and batches.user_id = item_row.user_id
  for update;

  if not found then
    perform pgmq.delete('finance_share_ocr', queue_row.msg_id);
    return pg_catalog.jsonb_build_object(
      'state', 'discarded',
      'message_id', queue_row.msg_id,
      'reason', 'batch_not_found'
    );
  end if;

  if item_row.status in ('auto_confirmed', 'review_required', 'duplicate', 'failed') then
    perform pgmq.delete('finance_share_ocr', queue_row.msg_id);
    return pg_catalog.jsonb_build_object(
      'state', 'discarded',
      'message_id', queue_row.msg_id,
      'reason', 'already_terminal'
    );
  end if;

  if item_row.status = 'processing'
     and item_row.processing_lease_expires_at > lease_now then
    -- pgmq.read has already renewed message visibility. Treat an overlapping
    -- live item lease as no available work; the next recovery wake will retry.
    return pg_catalog.jsonb_build_object('state', 'empty');
  end if;

  attempt_id := pg_catalog.gen_random_uuid();
  was_exhausted := item_row.attempt_count >= 2;
  next_attempt_count := case
    when item_row.attempt_count >= 2 then 2
    else item_row.attempt_count + 1
  end;

  update finance_private.finance_share_batch_items
  set status = 'processing',
      attempt_count = next_attempt_count,
      processing_attempt_id = attempt_id,
      processing_started_at = lease_now,
      processing_lease_expires_at = lease_now
        + pg_catalog.make_interval(secs => p_lease_seconds),
      failure_code = null,
      failure_stage = null,
      updated_at = lease_now
  where id = item_row.id
  returning * into item_row;

  perform finance_private.finance_recount_share_batch_v1(item_row.batch_id);

  access_allowed := coalesce(
    public.finance_user_can_access_module_v1(item_row.user_id, 'finance'),
    false
  );

  terminal_reason := case
    when queue_processing_version <> item_row.processing_version
      or item_row.processing_version <> p_processing_version
      then 'processing_version_mismatch'
    when not access_allowed then 'finance_access_revoked'
    when was_exhausted then 'processing_attempts_exhausted'
    else null
  end;

  if terminal_reason is not null then
    terminal_outcome := 'failed';

    if item_row.intake_item_id is not null then
      select * into terminal_intake
      from public.finance_intake_items intakes
      where intakes.id = item_row.intake_item_id
        and intakes.user_id = item_row.user_id;

      select * into terminal_candidate
      from public.finance_candidate_transactions candidates
      where candidates.intake_item_id = item_row.intake_item_id
        and candidates.user_id = item_row.user_id
      limit 1;

      select * into terminal_transaction
      from public.finance_transactions transactions
      where transactions.intake_item_id = item_row.intake_item_id
        and transactions.user_id = item_row.user_id
      limit 1;

      terminal_outcome := case
        when item_row.exact_image_duplicate
          and (terminal_candidate.id is not null or terminal_transaction.id is not null)
          then 'duplicate'
        when terminal_transaction.id is not null
          and terminal_candidate.status = 'accepted'
          and terminal_intake.status = 'completed'
          then 'auto_confirmed'
        when terminal_candidate.id is not null
          and terminal_candidate.status = 'pending'
          and terminal_intake.status = 'review'
          then 'review_required'
        else 'failed'
      end;
    end if;

    completion_result := public.finance_complete_share_queue_item_v1(
      item_row.id,
      item_row.processing_attempt_id,
      terminal_outcome,
      item_row.intake_item_id,
      item_row.intake_processing_attempt_id,
      item_row.image_hash,
      item_row.exact_image_duplicate,
      case
        when terminal_outcome = 'failed' then coalesce(terminal_intake.failure_code, terminal_reason)
        else null
      end,
      case
        when terminal_outcome = 'failed' then coalesce(terminal_intake.failure_stage, 'queue')
        else null
      end,
      case
        when terminal_outcome = 'failed'
          then 'Background screenshot processing could not be completed.'
        else null
      end
    );

    return pg_catalog.jsonb_build_object(
      'state', 'discarded',
      'message_id', queue_row.msg_id,
      'reason', terminal_reason,
      'completion', completion_result
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'claimed',
    'message_id', queue_row.msg_id,
    'item', finance_private.finance_share_queue_item_json_v1(item_row.id)
  );
end;
$function$;

create function public.finance_retry_share_queue_item_v1(
  p_batch_item_id uuid,
  p_processing_attempt_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  item_row finance_private.finance_share_batch_items%rowtype;
  attempt_id uuid;
  lease_now timestamp with time zone := pg_catalog.clock_timestamp();
begin
  if p_batch_item_id is null or p_processing_attempt_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_LEASE';
  end if;

  select * into item_row
  from finance_private.finance_share_batch_items items
  where items.id = p_batch_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'FINANCE_SHARE_ITEM_NOT_FOUND';
  end if;
  if item_row.status <> 'processing'
     or item_row.processing_attempt_id <> p_processing_attempt_id then
    return pg_catalog.jsonb_build_object('state', 'stale');
  end if;
  if item_row.attempt_count >= 2 then
    return pg_catalog.jsonb_build_object(
      'state', 'exhausted',
      'item', finance_private.finance_share_queue_item_json_v1(item_row.id)
    );
  end if;

  attempt_id := pg_catalog.gen_random_uuid();
  update finance_private.finance_share_batch_items
  set attempt_count = attempt_count + 1,
      processing_attempt_id = attempt_id,
      processing_started_at = lease_now,
      processing_lease_expires_at = lease_now
        + pg_catalog.make_interval(secs => p_lease_seconds),
      exact_image_duplicate = false,
      failure_code = null,
      failure_stage = null,
      updated_at = lease_now
  where id = item_row.id
  returning * into item_row;

  return pg_catalog.jsonb_build_object(
    'state', 'retried',
    'item', finance_private.finance_share_queue_item_json_v1(item_row.id)
  );
end;
$function$;

create function public.finance_complete_share_queue_item_v1(
  p_batch_item_id uuid,
  p_processing_attempt_id uuid,
  p_outcome text,
  p_intake_item_id uuid default null,
  p_intake_processing_attempt_id uuid default null,
  p_image_hash text default null,
  p_exact_image_duplicate boolean default false,
  p_failure_code text default null,
  p_failure_stage text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  item_row finance_private.finance_share_batch_items%rowtype;
  batch_row finance_private.finance_share_batches%rowtype;
  intake_row public.finance_intake_items%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  transaction_row public.finance_transactions%rowtype;
  cleanup_paths jsonb;
  terminal_now timestamp with time zone := pg_catalog.clock_timestamp();
begin
  if p_batch_item_id is null
     or p_processing_attempt_id is null
     or p_outcome is null
     or p_outcome not in (
       'processing',
       'auto_confirmed',
       'review_required',
       'duplicate',
       'failed'
     ) then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_COMPLETION';
  end if;

  select * into item_row
  from finance_private.finance_share_batch_items items
  where items.id = p_batch_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'FINANCE_SHARE_ITEM_NOT_FOUND';
  end if;

  select * into batch_row
  from finance_private.finance_share_batches batches
  where batches.id = item_row.batch_id
    and batches.user_id = item_row.user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'FINANCE_SHARE_BATCH_NOT_FOUND';
  end if;

  if item_row.status in ('auto_confirmed', 'review_required', 'duplicate', 'failed') then
    return pg_catalog.jsonb_build_object(
      'state', 'terminal',
      'item', finance_private.finance_share_queue_item_json_v1(item_row.id)
    );
  end if;

  if item_row.status <> 'processing'
     or item_row.processing_attempt_id <> p_processing_attempt_id then
    return pg_catalog.jsonb_build_object('state', 'stale');
  end if;

  if p_image_hash is not null
     and p_image_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_IMAGE_HASH';
  end if;
  if item_row.image_hash is not null
     and item_row.image_hash is distinct from p_image_hash then
    raise exception using errcode = '23514', message = 'FINANCE_SHARE_IMAGE_HASH_CHANGED';
  end if;

  if p_outcome = 'processing' then
    if p_intake_item_id is null
       or p_intake_processing_attempt_id is null
       or p_image_hash is null then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INTAKE_BINDING_REQUIRED';
    end if;

    select * into intake_row
    from public.finance_intake_items intakes
    where intakes.id = p_intake_item_id
      and intakes.user_id = item_row.user_id;

    if not found then
      raise exception using errcode = '23503', message = 'FINANCE_SHARE_INTAKE_NOT_FOUND';
    end if;
    if intake_row.processing_attempt_id is distinct from p_intake_processing_attempt_id
       and intake_row.status = 'processing' then
      raise exception using errcode = '40001', message = 'FINANCE_SHARE_INTAKE_FENCE_CHANGED';
    end if;
    if intake_row.image_hash is distinct from p_image_hash then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_IMAGE_HASH_CHANGED';
    end if;
    if item_row.intake_item_id is not null
       and item_row.intake_item_id <> p_intake_item_id then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_INTAKE_CHANGED';
    end if;

    update finance_private.finance_share_batch_items
    set intake_item_id = p_intake_item_id,
        intake_processing_attempt_id = p_intake_processing_attempt_id,
        image_hash = p_image_hash,
        exact_image_duplicate = coalesce(p_exact_image_duplicate, false),
        updated_at = terminal_now
    where id = item_row.id
    returning * into item_row;

    return pg_catalog.jsonb_build_object(
      'state', 'bound',
      'item', finance_private.finance_share_queue_item_json_v1(item_row.id)
    );
  end if;

  if p_intake_item_id is not null
     and item_row.intake_item_id is not null
     and item_row.intake_item_id <> p_intake_item_id then
    raise exception using errcode = '23514', message = 'FINANCE_SHARE_INTAKE_CHANGED';
  end if;

  if item_row.intake_item_id is null and p_intake_item_id is not null then
    update finance_private.finance_share_batch_items
    set intake_item_id = p_intake_item_id,
        intake_processing_attempt_id = p_intake_processing_attempt_id,
        image_hash = p_image_hash,
        exact_image_duplicate = coalesce(p_exact_image_duplicate, false),
        updated_at = terminal_now
    where id = item_row.id
    returning * into item_row;
  end if;

  if p_outcome = 'failed' and item_row.intake_item_id is null then
    if p_failure_code is null
       or p_failure_code !~ '^[a-z0-9][a-z0-9_]{0,63}$'
       or p_failure_stage is null
       or p_failure_stage !~ '^[a-z][a-z0-9_]{0,63}$'
       or p_error_message is null
       or pg_catalog.char_length(pg_catalog.btrim(p_error_message)) not between 1 and 500 then
      raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_FAILURE';
    end if;

    insert into public.finance_intake_items (
      user_id,
      source,
      status,
      image_hash,
      original_filename,
      processed_at,
      error_message,
      processing_attempt_id,
      processing_started_at,
      processing_attempt_count,
      processing_version,
      failure_code,
      failure_stage
    ) values (
      item_row.user_id,
      'screenshot',
      'failed',
      p_image_hash,
      item_row.original_filename,
      terminal_now,
      pg_catalog.left(pg_catalog.btrim(p_error_message), 500),
      item_row.processing_attempt_id,
      item_row.processing_started_at,
      item_row.attempt_count,
      item_row.processing_version,
      p_failure_code,
      p_failure_stage
    )
    returning * into intake_row;

    update finance_private.finance_share_batch_items
    set intake_item_id = intake_row.id,
        intake_processing_attempt_id = intake_row.processing_attempt_id,
        image_hash = p_image_hash,
        updated_at = terminal_now
    where id = item_row.id
    returning * into item_row;
  elsif item_row.intake_item_id is not null then
    select * into intake_row
    from public.finance_intake_items intakes
    where intakes.id = item_row.intake_item_id
      and intakes.user_id = item_row.user_id
    for update;

    if not found then
      raise exception using errcode = '23503', message = 'FINANCE_SHARE_INTAKE_NOT_FOUND';
    end if;
    if item_row.image_hash is null
       or intake_row.image_hash is distinct from item_row.image_hash then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_IMAGE_HASH_CHANGED';
    end if;
  end if;

  if item_row.intake_item_id is not null then
    select * into candidate_row
    from public.finance_candidate_transactions candidates
    where candidates.intake_item_id = item_row.intake_item_id
      and candidates.user_id = item_row.user_id
    limit 1;

    select * into transaction_row
    from public.finance_transactions transactions
    where transactions.intake_item_id = item_row.intake_item_id
      and transactions.user_id = item_row.user_id
    limit 1;
  end if;

  if p_outcome = 'auto_confirmed' then
    if transaction_row.id is null
       or candidate_row.id is null
       or candidate_row.status <> 'accepted'
       or intake_row.status <> 'completed' then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_AUTO_CONFIRMATION_NOT_DURABLE';
    end if;
  elsif p_outcome = 'review_required' then
    if candidate_row.id is null
       or candidate_row.status <> 'pending'
       or intake_row.status <> 'review' then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_REVIEW_NOT_DURABLE';
    end if;
  elsif p_outcome = 'duplicate' then
    if not item_row.exact_image_duplicate
       or item_row.intake_item_id is null
       or item_row.image_hash is null
       or intake_row.image_hash is distinct from item_row.image_hash then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_DUPLICATE_NOT_DURABLE';
    end if;
  elsif p_outcome = 'failed' then
    if intake_row.id is null or intake_row.status <> 'failed' then
      if intake_row.id is not null
         and intake_row.status = 'processing'
         and item_row.intake_processing_attempt_id is not null
         and candidate_row.id is null
         and transaction_row.id is null
         and p_failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'
         and p_failure_stage ~ '^[a-z][a-z0-9_]{0,63}$'
         and p_error_message is not null then
        -- This service-only completion RPC must remain able to settle work
        -- after the user loses Finance access. The public intake failure RPC
        -- reauthorizes current module access, so apply the same ownership
        -- fence directly here instead.
        update public.finance_intake_items intakes
        set status = 'failed',
            processed_at = terminal_now,
            error_message = pg_catalog.left(
              coalesce(
                nullif(pg_catalog.btrim(p_error_message), ''),
                'Screenshot processing failed'
              ),
              500
            ),
            processing_lease_expires_at = null,
            failure_code = p_failure_code,
            failure_stage = p_failure_stage,
            updated_at = terminal_now
        where intakes.id = item_row.intake_item_id
          and intakes.user_id = item_row.user_id
          and intakes.status = 'processing'
          and intakes.processing_attempt_id
            = item_row.intake_processing_attempt_id
        returning * into intake_row;

        if not found then
          select * into intake_row
          from public.finance_intake_items intakes
          where intakes.id = item_row.intake_item_id
            and intakes.user_id = item_row.user_id;
        end if;
      end if;
    end if;

    if intake_row.id is null or intake_row.status <> 'failed' then
      raise exception using errcode = '23514', message = 'FINANCE_SHARE_FAILURE_NOT_DURABLE';
    end if;
  end if;

  update finance_private.finance_share_batch_items
  set status = p_outcome,
      processing_lease_expires_at = null,
      failure_code = case when p_outcome = 'failed' then intake_row.failure_code else null end,
      failure_stage = case when p_outcome = 'failed' then intake_row.failure_stage else null end,
      terminal_at = terminal_now,
      updated_at = terminal_now
  where id = item_row.id
  returning * into item_row;

  perform pgmq.delete('finance_share_ocr', item_row.queue_message_id);
  perform finance_private.finance_recount_share_batch_v1(item_row.batch_id);

  select * into batch_row
  from finance_private.finance_share_batches batches
  where batches.id = item_row.batch_id;

  if batch_row.status = 'cleaning_up' then
    select coalesce(
      pg_catalog.jsonb_agg(items.storage_path order by items.created_at, items.id),
      '[]'::jsonb
    ) into cleanup_paths
    from finance_private.finance_share_batch_items items
    where items.batch_id = batch_row.id;
  end if;

  return pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'state', 'completed',
      'item', finance_private.finance_share_queue_item_json_v1(item_row.id),
      'cleanup', case
        when batch_row.status = 'cleaning_up' then
          pg_catalog.jsonb_build_object(
            'batch_id', batch_row.id,
            'cleanup_attempt_id', batch_row.cleanup_attempt_id,
            'storage_paths', cleanup_paths
          )
        else null
      end
    )
  );
end;
$function$;

create function public.finance_cleanup_share_batch_v1(
  p_batch_id uuid,
  p_cleanup_attempt_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  reservation_row finance_private.finance_share_upload_reservations%rowtype;
  batch_row finance_private.finance_share_batches%rowtype;
begin
  if p_batch_id is null or p_cleanup_attempt_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_CLEANUP';
  end if;

  select * into batch_row
  from finance_private.finance_share_batches batches
  where batches.id = p_batch_id
  for update;

  if found then
    if batch_row.status <> 'cleaning_up' then
      return pg_catalog.jsonb_build_object('state', 'not_ready', 'batch_id', p_batch_id);
    end if;
    if batch_row.cleanup_attempt_id <> p_cleanup_attempt_id then
      return pg_catalog.jsonb_build_object('state', 'stale', 'batch_id', p_batch_id);
    end if;
    if exists (
      select 1
      from finance_private.finance_share_batch_items items
      where items.batch_id = batch_row.id
        and items.status not in (
          'auto_confirmed',
          'review_required',
          'duplicate',
          'failed'
        )
    ) then
      return pg_catalog.jsonb_build_object('state', 'not_ready', 'batch_id', p_batch_id);
    end if;

    delete from finance_private.finance_share_batches
    where id = batch_row.id;

    return pg_catalog.jsonb_build_object('state', 'cleaned', 'batch_id', p_batch_id);
  end if;

  select * into reservation_row
  from finance_private.finance_share_upload_reservations reservations
  where reservations.batch_id = p_batch_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('state', 'missing', 'batch_id', p_batch_id);
  end if;
  if reservation_row.status <> 'cleaning_up' then
    return pg_catalog.jsonb_build_object('state', 'not_ready', 'batch_id', p_batch_id);
  end if;
  if reservation_row.cleanup_attempt_id <> p_cleanup_attempt_id then
    return pg_catalog.jsonb_build_object('state', 'stale', 'batch_id', p_batch_id);
  end if;

  delete from finance_private.finance_share_upload_reservations
  where id = reservation_row.id;

  return pg_catalog.jsonb_build_object(
    'state',
    'reservation_cleaned',
    'batch_id',
    p_batch_id
  );
end;
$function$;

-- Recovery is intentionally inert until both named Vault secrets exist.
-- finance_share_render_wake_url must be the full HTTPS Render drain endpoint.
-- finance_share_render_wake_secret must match FINANCE_QUEUE_WAKE_SECRET on
-- Render and Vercel. No secret value is embedded in migration history.
create function finance_private.finance_wake_share_queue_v1()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  wake_url text;
  wake_secret text;
  request_id bigint;
begin
  if not exists (
    select 1
    from finance_private.finance_share_batches batches
    where batches.status = 'queued'
       or (
         batches.status = 'processing'
         and exists (
           select 1
           from finance_private.finance_share_batch_items items
           where items.batch_id = batches.id
             and items.status = 'processing'
             and items.processing_lease_expires_at
               <= pg_catalog.clock_timestamp()
         )
       )
       or (
         batches.status = 'cleaning_up'
         and batches.cleanup_lease_expires_at <= pg_catalog.clock_timestamp()
       )
  ) and not exists (
    select 1
    from finance_private.finance_share_upload_reservations reservations
    where reservations.expires_at <= pg_catalog.clock_timestamp()
  ) then
    return null;
  end if;

  select secrets.decrypted_secret into wake_url
  from vault.decrypted_secrets secrets
  where secrets.name = 'finance_share_render_wake_url'
  limit 1;

  select secrets.decrypted_secret into wake_secret
  from vault.decrypted_secrets secrets
  where secrets.name = 'finance_share_render_wake_secret'
  limit 1;

  if wake_url is null
     or wake_url !~ '^https://[^[:space:]]+$'
     or wake_secret is null
     or pg_catalog.char_length(wake_secret) < 32 then
    return null;
  end if;

  select net.http_post(
    url := wake_url,
    body := pg_catalog.jsonb_build_object('reason', 'scheduled_recovery'),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || wake_secret
    ),
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end;
$function$;

do $cron_schedule$
declare
  existing_job_id bigint;
begin
  select jobs.jobid into existing_job_id
  from cron.job jobs
  where jobs.jobname = 'finance-share-queue-recovery'
    and jobs.username = current_user
  order by jobs.jobid
  limit 1;

  if existing_job_id is null then
    perform cron.schedule(
      'finance-share-queue-recovery',
      '*/2 * * * *',
      'select finance_private.finance_wake_share_queue_v1();'
    );
  else
    perform cron.alter_job(
      existing_job_id,
      schedule := '*/2 * * * *',
      command := 'select finance_private.finance_wake_share_queue_v1();',
      database := pg_catalog.current_database(),
      active := true
    );
  end if;
end;
$cron_schedule$;

revoke execute on all functions in schema finance_private
  from public, anon, authenticated;
grant execute on all functions in schema finance_private
  to service_role;

revoke all on function public.finance_prepare_share_batch_v1(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_get_share_upload_reservation_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_commit_share_batch_v1(uuid, uuid, uuid, uuid[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_get_active_share_batch_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_claim_share_queue_item_v1(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_retry_share_queue_item_v1(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finance_complete_share_queue_item_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  text,
  boolean,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function public.finance_cleanup_share_batch_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.finance_prepare_share_batch_v1(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.finance_get_share_upload_reservation_v1(uuid, uuid, uuid)
  to service_role;
grant execute on function public.finance_commit_share_batch_v1(uuid, uuid, uuid, uuid[], integer)
  to service_role;
grant execute on function public.finance_get_active_share_batch_v1(uuid)
  to service_role;
grant execute on function public.finance_claim_share_queue_item_v1(integer, integer)
  to service_role;
grant execute on function public.finance_retry_share_queue_item_v1(uuid, uuid, integer)
  to service_role;
grant execute on function public.finance_complete_share_queue_item_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  text,
  boolean,
  text,
  text,
  text
) to service_role;
grant execute on function public.finance_cleanup_share_batch_v1(uuid, uuid)
  to service_role;

comment on table finance_private.finance_share_upload_reservations is
  'Short-lived cleanup ledger for confirmed signed uploads before the atomic Finance queue commit.';
comment on table finance_private.finance_share_batches is
  'Transient active Finance share batch; deleted after verified temporary-object cleanup.';
comment on table finance_private.finance_share_batch_items is
  'Transient one-image Finance share work with queue, lease, intake lineage, and terminal outcome.';
comment on function public.finance_complete_share_queue_item_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  text,
  boolean,
  text,
  text,
  text
) is
  'Binds Finance intake lineage with outcome=processing, then validates and commits one terminal share outcome.';

notify pgrst, 'reload schema';
