-- A newly confirmed Android share supersedes older transient share work.
--
-- Durable Finance results that already reached a transaction or review
-- candidate are preserved. Queued work is removed, in-flight intake leases are
-- fenced, and the old batch is made immediately eligible for Storage cleanup.

create or replace function finance_private.finance_share_active_batch_exists_v1(
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
      and batches.status in ('queued', 'processing')
  );
$function$;

create or replace function finance_private.finance_replace_share_work_v1(
  p_user_id uuid
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
  intake_row public.finance_intake_items%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  transaction_row public.finance_transactions%rowtype;
  replacement_now timestamp with time zone := pg_catalog.clock_timestamp();
  terminal_outcome text;
  replaced_reservations integer := 0;
  replaced_batches integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_SHARE_INVALID_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-share-active:' || p_user_id::text,
      0
    )
  );

  for reservation_row in
    select *
    from finance_private.finance_share_upload_reservations reservations
    where reservations.user_id = p_user_id
      and reservations.status <> 'cleaning_up'
    order by reservations.created_at, reservations.id
    for update
  loop
    update finance_private.finance_share_upload_reservations
    set status = 'cleaning_up',
        expires_at = least(
          expires_at,
          replacement_now - interval '2 seconds'
        ),
        cleanup_attempt_id = pg_catalog.gen_random_uuid(),
        cleanup_started_at = replacement_now - interval '2 seconds',
        cleanup_lease_expires_at = replacement_now - interval '1 second',
        cleanup_attempt_count = cleanup_attempt_count + 1,
        updated_at = replacement_now
    where id = reservation_row.id;

    replaced_reservations := replaced_reservations + 1;
  end loop;

  for batch_row in
    select *
    from finance_private.finance_share_batches batches
    where batches.user_id = p_user_id
      and batches.status in ('queued', 'processing')
    order by batches.created_at, batches.id
    for update
  loop
    for item_row in
      select *
      from finance_private.finance_share_batch_items items
      where items.batch_id = batch_row.id
        and items.status in ('queued', 'processing')
      order by items.created_at, items.id
      for update
    loop
      perform pgmq.delete('finance_share_ocr', item_row.queue_message_id);

      intake_row := null;
      candidate_row := null;
      transaction_row := null;
      terminal_outcome := 'failed';

      if item_row.intake_item_id is not null then
        select * into intake_row
        from public.finance_intake_items intakes
        where intakes.id = item_row.intake_item_id
          and intakes.user_id = item_row.user_id
        for update;

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

        if intake_row.id is not null
           and intake_row.status = 'processing'
           and intake_row.processing_attempt_id
             is not distinct from item_row.intake_processing_attempt_id
           and candidate_row.id is null
           and transaction_row.id is null then
          update public.finance_intake_items intakes
          set status = 'failed',
              processed_at = replacement_now,
              error_message = 'This shared image was replaced by a newer share.',
              processing_lease_expires_at = null,
              failure_code = 'share_batch_replaced',
              failure_stage = 'queue',
              updated_at = replacement_now
          where intakes.id = intake_row.id
            and intakes.user_id = item_row.user_id
            and intakes.status = 'processing'
            and intakes.processing_attempt_id
              is not distinct from item_row.intake_processing_attempt_id
          returning * into intake_row;
        end if;

        terminal_outcome := case
          when item_row.exact_image_duplicate
            and (candidate_row.id is not null or transaction_row.id is not null)
            then 'duplicate'
          when transaction_row.id is not null
            and candidate_row.status = 'accepted'
            and intake_row.status = 'completed'
            then 'auto_confirmed'
          when candidate_row.id is not null
            and candidate_row.status = 'pending'
            and intake_row.status = 'review'
            then 'review_required'
          else 'failed'
        end;
      end if;

      update finance_private.finance_share_batch_items
      set status = terminal_outcome,
          attempt_count = greatest(attempt_count, 1),
          processing_attempt_id = coalesce(
            processing_attempt_id,
            pg_catalog.gen_random_uuid()
          ),
          processing_started_at = coalesce(processing_started_at, replacement_now),
          processing_lease_expires_at = null,
          failure_code = case
            when terminal_outcome = 'failed'
              then coalesce(intake_row.failure_code, 'share_batch_replaced')
            else null
          end,
          failure_stage = case
            when terminal_outcome = 'failed'
              then coalesce(intake_row.failure_stage, 'queue')
            else null
          end,
          terminal_at = replacement_now,
          updated_at = replacement_now
      where id = item_row.id;
    end loop;

    perform finance_private.finance_recount_share_batch_v1(batch_row.id);

    update finance_private.finance_share_batches
    set cleanup_started_at = replacement_now - interval '2 seconds',
        cleanup_lease_expires_at = replacement_now - interval '1 second',
        updated_at = replacement_now
    where id = batch_row.id
      and status = 'cleaning_up';

    replaced_batches := replaced_batches + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'replaced_reservations', replaced_reservations,
    'replaced_batches', replaced_batches
  );
end;
$function$;

create or replace function public.finance_prepare_share_batch_v1(
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

  perform finance_private.finance_replace_share_work_v1(p_user_id);

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

create or replace function public.finance_get_active_share_batch_v1(
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
    and batches.status in ('queued', 'processing')
  order by batches.created_at desc, batches.id
  limit 1;

  if batch_id is null then
    return null;
  end if;
  return finance_private.finance_share_batch_json_v1(batch_id);
end;
$function$;

revoke all on function finance_private.finance_replace_share_work_v1(uuid)
  from public, anon, authenticated;
grant execute on function finance_private.finance_replace_share_work_v1(uuid)
  to service_role;
