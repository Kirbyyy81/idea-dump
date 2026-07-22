-- Render owns screenshot OCR after the full cutover. Screenshot bytes remain
-- outside Postgres; this migration adds only a fenced processing lease and the
-- short, atomic persistence functions used by the Render service.

alter table public.finance_intake_items
  add column processing_attempt_id uuid,
  add column processing_started_at timestamp with time zone,
  add column processing_lease_expires_at timestamp with time zone,
  add column processing_attempt_count integer default 0 not null,
  add column processing_version integer default 0 not null,
  add column failure_code text,
  add column failure_stage text;

-- Existing processing rows predate leases. Make them immediately reclaimable
-- rather than leaving them permanently busy or silently changing their status.
update public.finance_intake_items
set processing_attempt_id = gen_random_uuid(),
    processing_started_at = now() - interval '2 seconds',
    processing_lease_expires_at = now() - interval '1 second',
    processing_attempt_count = 1,
    processing_version = 1
where status = 'processing';

alter table public.finance_intake_items
  add constraint finance_intake_items_processing_attempt_count_check
    check (processing_attempt_count >= 0),
  add constraint finance_intake_items_processing_version_check
    check (processing_version >= 0),
  -- The zero/null branch is a temporary deployment bridge for requests that
  -- entered the legacy Next.js handler before the coordinated Render cutover.
  -- Begin v2 treats that shape as an immediately reclaimable intake.
  add constraint finance_intake_items_processing_lease_shape_check
    check (
      (
        status = 'processing'
        and (
          (
            processing_attempt_id is not null
            and processing_started_at is not null
            and processing_lease_expires_at is not null
            and processing_lease_expires_at > processing_started_at
            and processing_attempt_count >= 1
            and processing_version >= 1
          )
          or (
            processing_attempt_id is null
            and processing_started_at is null
            and processing_lease_expires_at is null
            and processing_attempt_count = 0
            and processing_version = 0
          )
        )
      )
      or (
        status <> 'processing'
        and processing_lease_expires_at is null
      )
    ),
  add constraint finance_intake_items_failure_code_check
    check (
      failure_code is null
      or failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'
    ),
  add constraint finance_intake_items_failure_stage_check
    check (
      failure_stage is null
      or failure_stage ~ '^[a-z][a-z0-9_]{0,63}$'
    );

create index finance_intake_items_active_lease_idx
  on public.finance_intake_items (user_id, processing_lease_expires_at)
  where status = 'processing'
    and processing_lease_expires_at is not null;

-- This reproduces the application's current access precedence:
-- enabled module -> always-allowed -> user override -> assigned/default role.
-- The caller has already validated the Supabase access token. A service-role
-- caller is required because the RBAC tables deliberately deny browser roles.
create function public.finance_user_can_access_module_v1(
  p_user_id uuid,
  p_module_slug text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  module_row public.dim_modules%rowtype;
  override_effect text;
  resolved_role_id uuid;
begin
  if p_user_id is null
     or nullif(pg_catalog.btrim(p_module_slug), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(p_module_slug)) > 100 then
    return false;
  end if;

  select * into module_row
  from public.dim_modules
  where modules = pg_catalog.btrim(p_module_slug)
    and enabled = true;

  if not found then
    return false;
  end if;

  if module_row.is_always_allowed then
    return true;
  end if;

  select overrides.effect into override_effect
  from public.bridge_user_module_overrides overrides
  where overrides.user_id = p_user_id
    and overrides.module_id = module_row.id;

  if found then
    return override_effect = 'allow';
  end if;

  select user_roles.role_id into resolved_role_id
  from public.bridge_user_roles user_roles
  where user_roles.user_id = p_user_id;

  if not found then
    select roles.id into resolved_role_id
    from public.dim_roles roles
    where roles.role = 'member';
  end if;

  return resolved_role_id is not null
    and exists (
      select 1
      from public.bridge_role_modules role_modules
      where role_modules.role_id = resolved_role_id
        and role_modules.module_id = module_row.id
    );
end;
$function$;

create function public.finance_begin_screenshot_intake_v2(
  p_user_id uuid,
  p_image_hash text,
  p_original_filename text,
  p_processing_attempt_id uuid,
  p_lease_seconds integer,
  p_processing_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  intake_row public.finance_intake_items%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  transaction_row public.finance_transactions%rowtype;
  lease_now timestamp with time zone := pg_catalog.clock_timestamp();
  retry_after_seconds integer;
begin
  if not public.finance_user_can_access_module_v1(p_user_id, 'finance') then
    raise exception using errcode = '42501', message = 'Finance access denied';
  end if;
  if p_image_hash is null or p_image_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Finance image hash is invalid';
  end if;
  if p_processing_attempt_id is null then
    raise exception using errcode = '22023', message = 'Finance processing attempt is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then
    raise exception using errcode = '22023', message = 'Finance processing lease must be between 60 and 1800 seconds';
  end if;
  if p_processing_version is null or p_processing_version < 1 then
    raise exception using errcode = '22023', message = 'Finance processing version is invalid';
  end if;
  if p_original_filename is null
     or pg_catalog.char_length(pg_catalog.btrim(p_original_filename)) not between 1 and 255
     or p_original_filename ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Finance original filename is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-intake:' || p_user_id::text || ':' || p_image_hash,
      0
    )
  );

  select * into intake_row
  from public.finance_intake_items
  where user_id = p_user_id
    and image_hash = p_image_hash
  for update;

  if not found then
    insert into public.finance_intake_items (
      user_id,
      source,
      status,
      image_hash,
      original_filename,
      processing_attempt_id,
      processing_started_at,
      processing_lease_expires_at,
      processing_attempt_count,
      processing_version
    ) values (
      p_user_id,
      'screenshot',
      'processing',
      p_image_hash,
      pg_catalog.btrim(p_original_filename),
      p_processing_attempt_id,
      lease_now,
      lease_now + pg_catalog.make_interval(secs => p_lease_seconds),
      1,
      p_processing_version
    )
    returning * into intake_row;

    return jsonb_build_object(
      'state', 'started',
      'should_process', true,
      'retry_after_seconds', null,
      'intake', to_jsonb(intake_row),
      'candidate', null,
      'transaction', null
    );
  end if;

  select * into candidate_row
  from public.finance_candidate_transactions
  where user_id = p_user_id
    and intake_item_id = intake_row.id
  limit 1;

  select * into transaction_row
  from public.finance_transactions
  where user_id = p_user_id
    and intake_item_id = intake_row.id
  limit 1;

  if candidate_row.id is not null or transaction_row.id is not null then
    return jsonb_build_object(
      'state', 'terminal',
      'should_process', false,
      'retry_after_seconds', null,
      'intake', to_jsonb(intake_row),
      'candidate', case when candidate_row.id is null then null else to_jsonb(candidate_row) end,
      'transaction', case when transaction_row.id is null then null else to_jsonb(transaction_row) end
    );
  end if;

  if intake_row.status in ('review', 'completed', 'duplicate', 'rejected') then
    return jsonb_build_object(
      'state', 'terminal',
      'reason', 'terminal_without_lineage',
      'should_process', false,
      'retry_after_seconds', null,
      'intake', to_jsonb(intake_row),
      'candidate', null,
      'transaction', null
    );
  end if;

  if intake_row.status = 'processing'
     and intake_row.processing_lease_expires_at is not null
     and intake_row.processing_lease_expires_at > lease_now then
    retry_after_seconds := pg_catalog.greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from intake_row.processing_lease_expires_at - lease_now)
      )::integer
    );
    return jsonb_build_object(
      'state', 'busy',
      'should_process', false,
      'retry_after_seconds', retry_after_seconds,
      'intake', to_jsonb(intake_row),
      'candidate', null,
      'transaction', null
    );
  end if;

  update public.finance_intake_items
  set source = 'screenshot',
      status = 'processing',
      original_filename = pg_catalog.btrim(p_original_filename),
      ocr_text = null,
      ocr_raw_text = null,
      ocr_normalized_text = null,
      ocr_confidence = null,
      ocr_text_hash = null,
      normalizer_version = null,
      detected_source_id = null,
      source_detection_signals = '[]'::jsonb,
      received_at = lease_now,
      processed_at = null,
      error_message = null,
      processing_attempt_id = p_processing_attempt_id,
      processing_started_at = lease_now,
      processing_lease_expires_at = lease_now + pg_catalog.make_interval(secs => p_lease_seconds),
      processing_attempt_count = processing_attempt_count + 1,
      processing_version = p_processing_version,
      failure_code = null,
      failure_stage = null,
      updated_at = lease_now
  where id = intake_row.id
    and user_id = p_user_id
  returning * into intake_row;

  return jsonb_build_object(
    'state', 'recovered',
    'should_process', true,
    'retry_after_seconds', null,
    'intake', to_jsonb(intake_row),
    'candidate', null,
    'transaction', null
  );
end;
$function$;

create function public.finance_finalize_screenshot_intake_v2(
  p_user_id uuid,
  p_intake_id uuid,
  p_processing_attempt_id uuid,
  p_ocr_raw_text text,
  p_ocr_normalized_text text,
  p_ocr_confidence numeric,
  p_ocr_text_hash text,
  p_normalizer_version integer,
  p_detected_source_id uuid,
  p_source_detection_signals jsonb,
  p_candidate_payload jsonb,
  p_candidate_confidence numeric,
  p_matched_rule_id uuid,
  p_duplicate_outcome text,
  p_duplicate_score numeric,
  p_duplicate_signals jsonb,
  p_duplicate_explanation text,
  p_duplicate_transaction_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  intake_row public.finance_intake_items%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  transaction_row public.finance_transactions%rowtype;
  canonical_payload jsonb;
  duplicate_signal_values text[] := '{}'::text[];
  finalized_at timestamp with time zone := pg_catalog.clock_timestamp();
begin
  if not public.finance_user_can_access_module_v1(p_user_id, 'finance') then
    raise exception using errcode = '42501', message = 'Finance access denied';
  end if;
  if p_intake_id is null or p_processing_attempt_id is null then
    raise exception using errcode = '22023', message = 'Finance intake and processing attempt are required';
  end if;
  if nullif(pg_catalog.btrim(p_ocr_raw_text), '') is null
     or nullif(pg_catalog.btrim(p_ocr_normalized_text), '') is null then
    raise exception using errcode = '22023', message = 'Finance OCR text is required';
  end if;
  if p_ocr_confidence is not null and p_ocr_confidence not between 0 and 100 then
    raise exception using errcode = '22023', message = 'Finance OCR confidence is invalid';
  end if;
  if p_ocr_text_hash is null or p_ocr_text_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Finance OCR text hash is invalid';
  end if;
  if p_normalizer_version is null or p_normalizer_version < 0 then
    raise exception using errcode = '22023', message = 'Finance normalizer version is invalid';
  end if;
  if p_source_detection_signals is null
     or pg_catalog.jsonb_typeof(p_source_detection_signals) <> 'array'
     or pg_catalog.jsonb_array_length(p_source_detection_signals) > 50 then
    raise exception using errcode = '22023', message = 'Finance source detection signals are invalid';
  end if;
  if p_candidate_payload is null or pg_catalog.jsonb_typeof(p_candidate_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Finance candidate payload is invalid';
  end if;
  if p_candidate_confidence is null or p_candidate_confidence not between 0 and 1 then
    raise exception using errcode = '22023', message = 'Finance candidate confidence is invalid';
  end if;
  if p_duplicate_outcome is null or p_duplicate_outcome not in ('none', 'possible', 'strong') then
    raise exception using errcode = '22023', message = 'Finance duplicate outcome is invalid';
  end if;
  if p_duplicate_score is not null and p_duplicate_score not between 0 and 100 then
    raise exception using errcode = '22023', message = 'Finance duplicate score is invalid';
  end if;
  if p_duplicate_explanation is not null
     and pg_catalog.char_length(p_duplicate_explanation) > 2000 then
    raise exception using errcode = '22023', message = 'Finance duplicate explanation is too long';
  end if;
  if p_duplicate_signals is null or pg_catalog.jsonb_typeof(p_duplicate_signals) <> 'array' then
    raise exception using errcode = '22023', message = 'Finance duplicate signals are invalid';
  end if;
  if pg_catalog.jsonb_array_length(p_duplicate_signals) > 16 then
    raise exception using errcode = '22023', message = 'Finance duplicate signals are too large';
  end if;
  if (p_duplicate_outcome = 'none' and p_duplicate_transaction_id is not null)
     or (p_duplicate_outcome <> 'none' and p_duplicate_transaction_id is null) then
    raise exception using errcode = '22023', message = 'Finance duplicate transaction does not match its outcome';
  end if;

  select coalesce(pg_catalog.array_agg(signals.value order by signals.ordinality), '{}'::text[])
  into duplicate_signal_values
  from pg_catalog.jsonb_array_elements_text(p_duplicate_signals)
    with ordinality as signals(value, ordinality);

  select * into intake_row
  from public.finance_intake_items
  where id = p_intake_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance intake not found';
  end if;

  select * into candidate_row
  from public.finance_candidate_transactions
  where intake_item_id = p_intake_id
    and user_id = p_user_id
  limit 1;

  if candidate_row.id is not null then
    if candidate_row.confirmed_transaction_id is not null then
      select * into transaction_row
      from public.finance_transactions
      where id = candidate_row.confirmed_transaction_id
        and intake_item_id = p_intake_id
        and user_id = p_user_id;
    end if;

    return jsonb_build_object(
      'state', 'terminal',
      'intake', to_jsonb(intake_row),
      'candidate', to_jsonb(candidate_row),
      'transaction', case when transaction_row.id is null then null else to_jsonb(transaction_row) end,
      'auto_confirmed', transaction_row.id is not null,
      'recovered', true
    );
  end if;

  if intake_row.status <> 'processing'
     or intake_row.processing_attempt_id is distinct from p_processing_attempt_id then
    raise exception using errcode = '40001', message = 'Finance processing attempt no longer owns this intake';
  end if;

  if p_detected_source_id is not null then
    perform 1
    from public.dim_finance_sources sources
    where sources.id = p_detected_source_id
      and sources.user_id = p_user_id
      and sources.is_archived = false
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance source not found';
    end if;
  end if;

  if nullif(p_candidate_payload ->> 'source_id', '') is distinct from
     (case when p_detected_source_id is null then null else p_detected_source_id::text end) then
    raise exception using errcode = '22023', message = 'Finance candidate source does not match source evidence';
  end if;

  if p_matched_rule_id is not null then
    perform 1
    from public.finance_rules rules
    where rules.id = p_matched_rule_id
      and rules.user_id = p_user_id
      and rules.is_active = true
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance rule not found';
    end if;
  end if;

  if p_duplicate_transaction_id is not null then
    perform 1
    from public.finance_transactions transactions
    where transactions.id = p_duplicate_transaction_id
      and transactions.user_id = p_user_id
      and transactions.status = 'confirmed'
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Matched Finance transaction not found';
    end if;
  end if;

  canonical_payload := case
    when p_duplicate_transaction_id is null then p_candidate_payload - 'duplicate_transaction_id'
    else pg_catalog.jsonb_set(
      p_candidate_payload,
      '{duplicate_transaction_id}',
      to_jsonb(p_duplicate_transaction_id::text),
      true
    )
  end;

  insert into public.finance_candidate_transactions (
    user_id,
    intake_item_id,
    payload,
    confidence,
    matched_rule_id,
    status,
    duplicate_outcome,
    duplicate_score,
    duplicate_signals,
    duplicate_explanation,
    duplicate_checked_at
  ) values (
    p_user_id,
    p_intake_id,
    canonical_payload,
    p_candidate_confidence,
    p_matched_rule_id,
    'pending',
    p_duplicate_outcome,
    p_duplicate_score,
    duplicate_signal_values,
    p_duplicate_explanation,
    finalized_at
  )
  on conflict (intake_item_id) do nothing
  returning * into candidate_row;

  if candidate_row.id is null then
    select * into candidate_row
    from public.finance_candidate_transactions
    where intake_item_id = p_intake_id
      and user_id = p_user_id;
  end if;

  if candidate_row.id is null then
    raise exception using errcode = '23505', message = 'Finance candidate could not be finalized';
  end if;

  update public.finance_intake_items
  set status = 'review',
      ocr_text = p_ocr_normalized_text,
      ocr_raw_text = p_ocr_raw_text,
      ocr_normalized_text = p_ocr_normalized_text,
      ocr_confidence = p_ocr_confidence,
      ocr_text_hash = p_ocr_text_hash,
      normalizer_version = p_normalizer_version,
      detected_source_id = p_detected_source_id,
      source_detection_signals = p_source_detection_signals,
      processed_at = finalized_at,
      error_message = null,
      processing_lease_expires_at = null,
      failure_code = null,
      failure_stage = null,
      updated_at = finalized_at
  where id = p_intake_id
    and user_id = p_user_id
    and status = 'processing'
    and processing_attempt_id = p_processing_attempt_id
  returning * into intake_row;

  if not found then
    raise exception using errcode = '40001', message = 'Finance processing attempt lost ownership while finalizing';
  end if;

  return jsonb_build_object(
    'state', 'review',
    'intake', to_jsonb(intake_row),
    'candidate', to_jsonb(candidate_row),
    'transaction', null,
    'auto_confirmed', false,
    'recovered', false
  );
end;
$function$;

create function public.finance_fail_screenshot_intake_v2(
  p_user_id uuid,
  p_intake_id uuid,
  p_processing_attempt_id uuid,
  p_failure_code text,
  p_failure_stage text,
  p_error_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  intake_row public.finance_intake_items%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  transaction_row public.finance_transactions%rowtype;
  failed_at timestamp with time zone := pg_catalog.clock_timestamp();
begin
  if not public.finance_user_can_access_module_v1(p_user_id, 'finance') then
    raise exception using errcode = '42501', message = 'Finance access denied';
  end if;
  if p_intake_id is null or p_processing_attempt_id is null then
    raise exception using errcode = '22023', message = 'Finance intake and processing attempt are required';
  end if;
  if p_failure_code is null or p_failure_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'Finance failure code is invalid';
  end if;
  if p_failure_stage is null or p_failure_stage !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'Finance failure stage is invalid';
  end if;

  select * into intake_row
  from public.finance_intake_items
  where id = p_intake_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance intake not found';
  end if;

  select * into candidate_row
  from public.finance_candidate_transactions
  where intake_item_id = p_intake_id
    and user_id = p_user_id
  limit 1;

  select * into transaction_row
  from public.finance_transactions
  where intake_item_id = p_intake_id
    and user_id = p_user_id
  limit 1;

  if candidate_row.id is not null or transaction_row.id is not null then
    return jsonb_build_object(
      'failed', false,
      'state', 'terminal',
      'reason', 'lineage_exists',
      'intake', to_jsonb(intake_row),
      'candidate', case when candidate_row.id is null then null else to_jsonb(candidate_row) end,
      'transaction', case when transaction_row.id is null then null else to_jsonb(transaction_row) end
    );
  end if;

  if intake_row.status = 'failed'
     and intake_row.processing_attempt_id = p_processing_attempt_id then
    return jsonb_build_object(
      'failed', true,
      'state', 'failed',
      'reason', 'already_failed',
      'intake', to_jsonb(intake_row),
      'candidate', null,
      'transaction', null
    );
  end if;

  if intake_row.status <> 'processing'
     or intake_row.processing_attempt_id is distinct from p_processing_attempt_id then
    return jsonb_build_object(
      'failed', false,
      'state', 'fenced',
      'reason', 'attempt_no_longer_owns_intake',
      'intake', to_jsonb(intake_row),
      'candidate', null,
      'transaction', null
    );
  end if;

  update public.finance_intake_items
  set status = 'failed',
      processed_at = failed_at,
      error_message = pg_catalog.left(
        coalesce(nullif(pg_catalog.btrim(p_error_message), ''), 'Screenshot processing failed'),
        500
      ),
      processing_lease_expires_at = null,
      failure_code = p_failure_code,
      failure_stage = p_failure_stage,
      updated_at = failed_at
  where id = p_intake_id
    and user_id = p_user_id
    and status = 'processing'
    and processing_attempt_id = p_processing_attempt_id
  returning * into intake_row;

  return jsonb_build_object(
    'failed', found,
    'state', case when found then 'failed' else 'fenced' end,
    'reason', case when found then null else 'attempt_no_longer_owns_intake' end,
    'intake', to_jsonb(intake_row),
    'candidate', null,
    'transaction', null
  );
end;
$function$;

-- Retain the five Finance state-transition RPCs used outside the retired OCR
-- route, but remove their processing-event side effects. Rebuilding from each
-- catalog definition preserves the exact deployed behavior and attributes.
-- The expected-count guard makes this fail closed if a body has drifted.
do $remove_finance_processing_event_writers$
declare
  function_row record;
  refreshed_definition text;
  event_insert_pattern constant text :=
    '[[:space:]]*insert[[:space:]]+into[[:space:]]+public[.]finance_processing_events[[:space:]]*[(][^;]*;';
  insert_count integer;
  remaining_count integer;
  function_owner text;
  is_security_definer boolean;
  function_config text[];
begin
  for function_row in
    select writers.function_oid, writers.expected_insert_count
    from (
      values
        ('public.finance_begin_screenshot_intake(uuid,text)'::regprocedure, 1),
        ('public.finance_confirm_candidate(uuid,uuid,uuid,uuid,text,numeric,text,date,text,text,text,boolean,text,text)'::regprocedure, 4),
        ('public.finance_delete_transaction(uuid,uuid)'::regprocedure, 1),
        ('public.finance_mark_candidate_duplicate(uuid,uuid,uuid)'::regprocedure, 1),
        ('public.finance_reject_candidate(uuid,uuid)'::regprocedure, 1)
    ) as writers(function_oid, expected_insert_count)
    order by writers.function_oid
  loop
    select
      pg_catalog.regexp_count(procedures.prosrc, event_insert_pattern, 1, 'i'),
      pg_catalog.pg_get_userbyid(procedures.proowner),
      procedures.prosecdef,
      procedures.proconfig
    into insert_count, function_owner, is_security_definer, function_config
    from pg_catalog.pg_proc procedures
    where procedures.oid = function_row.function_oid;

    if insert_count <> function_row.expected_insert_count then
      raise exception
        'Refusing to rewrite %, expected % processing-event inserts but found %',
        function_row.function_oid::regprocedure,
        function_row.expected_insert_count,
        insert_count;
    end if;
    if function_owner <> 'postgres'
       or is_security_definer
       or function_config is null
       or not ('search_path=""' = any(function_config)) then
      raise exception
        'Refusing to rewrite % because its owner or security attributes drifted',
        function_row.function_oid::regprocedure;
    end if;
    if not pg_catalog.has_function_privilege(
      'service_role',
      function_row.function_oid,
      'EXECUTE'
    ) then
      raise exception
        'Refusing to rewrite % because its service-role grant is missing',
        function_row.function_oid::regprocedure;
    end if;
    if exists (
      select 1
      from pg_catalog.pg_proc procedures
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedures.proacl,
          pg_catalog.acldefault('f', procedures.proowner)
        )
      ) privileges
      where procedures.oid = function_row.function_oid
        and privileges.privilege_type = 'EXECUTE'
        and (
          privileges.grantee = 0
          or privileges.grantee in (
            select roles.oid
            from pg_catalog.pg_roles roles
            where roles.rolname in ('anon', 'authenticated')
          )
        )
    ) then
      raise exception
        'Refusing to rewrite % because a browser role can execute it',
        function_row.function_oid::regprocedure;
    end if;

    select pg_catalog.regexp_replace(
      pg_catalog.pg_get_functiondef(function_row.function_oid),
      event_insert_pattern,
      '',
      'gi'
    )
    into refreshed_definition;

    if pg_catalog.regexp_count(refreshed_definition, event_insert_pattern, 1, 'i') <> 0 then
      raise exception
        'Failed to remove every processing-event insert from %',
        function_row.function_oid::regprocedure;
    end if;

    execute refreshed_definition;

    select pg_catalog.regexp_count(procedures.prosrc, event_insert_pattern, 1, 'i')
    into remaining_count
    from pg_catalog.pg_proc procedures
    where procedures.oid = function_row.function_oid;

    if remaining_count <> 0 then
      raise exception
        'Processing-event inserts remain in % after replacement',
        function_row.function_oid::regprocedure;
    end if;
  end loop;
end;
$remove_finance_processing_event_writers$;

revoke all on function public.finance_begin_screenshot_intake(uuid, text)
  from public, anon, authenticated;
revoke all on function public.finance_confirm_candidate(
  uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text,
  boolean, text, text
)
  from public, anon, authenticated;
revoke all on function public.finance_delete_transaction(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finance_mark_candidate_duplicate(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finance_reject_candidate(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.finance_begin_screenshot_intake(uuid, text)
  to service_role;
grant execute on function public.finance_confirm_candidate(
  uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text,
  boolean, text, text
)
  to service_role;
grant execute on function public.finance_delete_transaction(uuid, uuid)
  to service_role;
grant execute on function public.finance_mark_candidate_duplicate(uuid, uuid, uuid)
  to service_role;
grant execute on function public.finance_reject_candidate(uuid, uuid)
  to service_role;

revoke all on function public.finance_user_can_access_module_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.finance_begin_screenshot_intake_v2(uuid, text, text, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finance_finalize_screenshot_intake_v2(
  uuid, uuid, uuid, text, text, numeric, text, integer, uuid, jsonb,
  jsonb, numeric, uuid, text, numeric, jsonb, text, uuid
)
  from public, anon, authenticated;
revoke all on function public.finance_fail_screenshot_intake_v2(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.finance_user_can_access_module_v1(uuid, text)
  to service_role;
grant execute on function public.finance_begin_screenshot_intake_v2(uuid, text, text, uuid, integer, integer)
  to service_role;
grant execute on function public.finance_finalize_screenshot_intake_v2(
  uuid, uuid, uuid, text, text, numeric, text, integer, uuid, jsonb,
  jsonb, numeric, uuid, text, numeric, jsonb, text, uuid
)
  to service_role;
grant execute on function public.finance_fail_screenshot_intake_v2(uuid, uuid, uuid, text, text, text)
  to service_role;

comment on column public.finance_intake_items.processing_attempt_id is
  'Fencing token for the latest Render OCR attempt; retained after terminal state for idempotent recovery.';
comment on column public.finance_intake_items.processing_lease_expires_at is
  'Non-null only while status=processing. An expired lease may be reclaimed by begin v2.';
comment on function public.finance_begin_screenshot_intake_v2(uuid, text, text, uuid, integer, integer) is
  'Acquires or recovers the fenced, bounded Render OCR processing lease for one user/image hash.';
comment on function public.finance_finalize_screenshot_intake_v2(
  uuid, uuid, uuid, text, text, numeric, text, integer, uuid, jsonb,
  jsonb, numeric, uuid, text, numeric, jsonb, text, uuid
) is
  'Atomically persists OCR metadata and exactly one review candidate for the current fenced attempt.';

-- finance_processing_events intentionally remains in this preparation
-- migration. This branch and the rewritten RPCs no longer write to it; the
-- cleanup migration may drop it after the previously deployed upload route is
-- replaced and any in-flight legacy request has drained.
notify pgrst, 'reload schema';
