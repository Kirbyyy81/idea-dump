create function finance_private.finance_normalize_payee_key(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      normalize(pg_catalog.coalesce(p_value, ''), NFKC),
      '[^[:alnum:]]+',
      '',
      'g'
    )
  )
$function$;

create table public.dim_finance_payees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  is_archived boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint dim_finance_payees_id_user_id_key unique (id, user_id),
  constraint dim_finance_payees_user_normalized_name_key unique (user_id, normalized_name),
  constraint dim_finance_payees_name_check check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 500
    and name = pg_catalog.btrim(name)
    and normalized_name = finance_private.finance_normalize_payee_key(name)
    and normalized_name <> ''
  )
);

alter table public.dim_finance_payees enable row level security;

create index dim_finance_payees_user_active_name_idx
  on public.dim_finance_payees (user_id, name)
  where is_archived = false;

alter table public.finance_transactions
  add column payee_id uuid,
  add column recipient_reference text,
  add constraint finance_transactions_payee_id_fkey
    foreign key (payee_id, user_id)
    references public.dim_finance_payees(id, user_id)
    on delete no action
    deferrable initially deferred,
  add constraint finance_transactions_recipient_reference_check
    check (
      recipient_reference is null
      or (
        recipient_reference = pg_catalog.btrim(recipient_reference)
        and pg_catalog.char_length(recipient_reference) between 1 and 200
      )
    );

create index finance_transactions_payee_user_idx
  on public.finance_transactions (payee_id, user_id)
  where payee_id is not null;

create function finance_private.finance_resolve_payee_v1(
  p_user_id uuid,
  p_payee_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  normalized_key text;
  payee_id uuid;
begin
  if nullif(pg_catalog.btrim(p_payee_name), '') is null then
    return null;
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payee_name)) > 500 then
    raise exception using errcode = '22023', message = 'Finance payee must be 500 characters or fewer';
  end if;

  normalized_key := finance_private.finance_normalize_payee_key(p_payee_name);
  if normalized_key = '' then
    raise exception using errcode = '22023', message = 'Finance payee must contain a letter or number';
  end if;

  insert into public.dim_finance_payees (
    user_id,
    name,
    normalized_name
  ) values (
    p_user_id,
    pg_catalog.btrim(p_payee_name),
    normalized_key
  )
  on conflict (user_id, normalized_name)
  do update set
    is_archived = false,
    updated_at = now()
  returning id into payee_id;

  return payee_id;
end;
$function$;

create function public.finance_create_manual_transaction_v1(
  p_user_id uuid,
  p_source_id uuid,
  p_category_id uuid,
  p_direction text,
  p_amount numeric,
  p_merchant text,
  p_payee_name text,
  p_transaction_date date,
  p_notes text,
  p_currency text,
  p_reference_number text,
  p_recipient_reference text,
  p_manual_idempotency_key uuid
)
returns public.finance_transactions
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  resolved_payee_id uuid;
  transaction_row public.finance_transactions%rowtype;
begin
  resolved_payee_id := finance_private.finance_resolve_payee_v1(p_user_id, p_payee_name);

  insert into public.finance_transactions (
    user_id,
    source_id,
    category_id,
    direction,
    amount,
    merchant,
    payee_id,
    transaction_date,
    notes,
    source,
    status,
    currency,
    reference_number,
    recipient_reference,
    manual_idempotency_key
  ) values (
    p_user_id,
    p_source_id,
    p_category_id,
    p_direction,
    p_amount,
    nullif(pg_catalog.btrim(p_merchant), ''),
    resolved_payee_id,
    p_transaction_date,
    nullif(pg_catalog.btrim(p_notes), ''),
    'manual',
    'confirmed',
    p_currency,
    public.finance_normalize_reference_number(p_reference_number),
    nullif(pg_catalog.btrim(p_recipient_reference), ''),
    p_manual_idempotency_key
  )
  returning * into transaction_row;

  return transaction_row;
end;
$function$;

create function public.finance_confirm_candidate_v2(
  p_user_id uuid,
  p_candidate_id uuid,
  p_source_id uuid,
  p_category_id uuid,
  p_direction text,
  p_amount numeric,
  p_merchant text,
  p_payee_name text,
  p_transaction_date date,
  p_notes text,
  p_currency text,
  p_reference_number text,
  p_recipient_reference text,
  p_allow_duplicate boolean,
  p_duplicate_override_reason text,
  p_confirmation_mode text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  confirmation jsonb;
  resolved_payee_id uuid;
  transaction_id uuid;
  transaction_row public.finance_transactions%rowtype;
  candidate_row public.finance_candidate_transactions%rowtype;
  intake_context text;
  was_already_accepted boolean := false;
  correction record;
begin
  if p_recipient_reference is not null
     and pg_catalog.char_length(pg_catalog.btrim(p_recipient_reference)) > 200 then
    raise exception using errcode = '22023', message = 'Recipient reference must be 200 characters or fewer';
  end if;

  select * into candidate_row
  from public.finance_candidate_transactions
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  was_already_accepted := found and candidate_row.status = 'accepted';

  confirmation := public.finance_confirm_candidate(
    p_user_id,
    p_candidate_id,
    p_source_id,
    p_category_id,
    p_direction,
    p_amount,
    p_merchant,
    p_transaction_date,
    p_notes,
    p_currency,
    p_reference_number,
    p_allow_duplicate,
    p_duplicate_override_reason,
    p_confirmation_mode
  );

  if pg_catalog.coalesce((confirmation ->> 'confirmed')::boolean, false) is false then
    return confirmation;
  end if;

  if was_already_accepted then
    return confirmation;
  end if;

  transaction_id := nullif(confirmation -> 'transaction' ->> 'id', '')::uuid;
  if transaction_id is null then
    raise exception using errcode = '23514', message = 'Confirmed Finance transaction link is invalid';
  end if;

  resolved_payee_id := finance_private.finance_resolve_payee_v1(p_user_id, p_payee_name);

  update public.finance_transactions
  set payee_id = resolved_payee_id,
      recipient_reference = nullif(pg_catalog.btrim(p_recipient_reference), ''),
      updated_at = now()
  where id = transaction_id
    and user_id = p_user_id
  returning * into transaction_row;

  if not found then
    raise exception using errcode = '23514', message = 'Confirmed Finance transaction link is invalid';
  end if;

  if transaction_row.intake_item_id is not null then
    select pg_catalog.left(pg_catalog.coalesce(ocr_normalized_text, ocr_text), 1000)
    into intake_context
    from public.finance_intake_items
    where id = transaction_row.intake_item_id
      and user_id = p_user_id;
  end if;

  for correction in
    select field_name, previous_value, corrected_value
    from (values
      (
        'payee_name'::text,
        candidate_row.payload -> 'payee_name',
        to_jsonb(nullif(pg_catalog.btrim(p_payee_name), ''))
      ),
      (
        'recipient_reference'::text,
        candidate_row.payload -> 'recipient_reference',
        to_jsonb(nullif(pg_catalog.btrim(p_recipient_reference), ''))
      )
    ) as changes(field_name, previous_value, corrected_value)
    where pg_catalog.coalesce(previous_value, 'null'::jsonb)
          is distinct from pg_catalog.coalesce(corrected_value, 'null'::jsonb)
      and not exists (
        select 1
        from public.finance_corrections existing
        where existing.user_id = p_user_id
          and existing.transaction_id = transaction_row.id
          and existing.field_name = changes.field_name
          and pg_catalog.coalesce(existing.previous_value, 'null'::jsonb)
              = pg_catalog.coalesce(changes.previous_value, 'null'::jsonb)
          and pg_catalog.coalesce(existing.corrected_value, 'null'::jsonb)
              = pg_catalog.coalesce(changes.corrected_value, 'null'::jsonb)
      )
  loop
    insert into public.finance_corrections (
      user_id,
      transaction_id,
      intake_item_id,
      field_name,
      previous_value,
      corrected_value,
      context_excerpt
    ) values (
      p_user_id,
      transaction_row.id,
      transaction_row.intake_item_id,
      correction.field_name,
      correction.previous_value,
      correction.corrected_value,
      intake_context
    );
  end loop;

  return jsonb_set(confirmation, '{transaction}', to_jsonb(transaction_row), true);
end;
$function$;

create function public.finance_update_transaction_v2(
  p_user_id uuid,
  p_transaction_id uuid,
  p_source_id uuid,
  p_category_id uuid,
  p_direction text,
  p_amount numeric,
  p_merchant text,
  p_payee_name text,
  p_transaction_date date,
  p_notes text,
  p_currency text,
  p_reference_number text,
  p_recipient_reference text
)
returns public.finance_transactions
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  previous_row public.finance_transactions%rowtype;
  updated_row public.finance_transactions%rowtype;
  resolved_payee_id uuid;
  previous_payee_name text;
  corrected_payee_name text;
  context_text text;
  correction record;
begin
  if p_recipient_reference is not null
     and pg_catalog.char_length(pg_catalog.btrim(p_recipient_reference)) > 200 then
    raise exception using errcode = '22023', message = 'Recipient reference must be 200 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('idea-dump:finance-ledger:' || p_user_id::text, 0)
  );

  select transactions, payees.name
  into previous_row, previous_payee_name
  from public.finance_transactions transactions
  left join public.dim_finance_payees payees
    on payees.id = transactions.payee_id
   and payees.user_id = transactions.user_id
  where transactions.id = p_transaction_id
    and transactions.user_id = p_user_id
  for update of transactions;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance transaction not found';
  end if;

  updated_row := public.finance_update_transaction(
    p_user_id,
    p_transaction_id,
    p_source_id,
    p_category_id,
    p_direction,
    p_amount,
    p_merchant,
    p_transaction_date,
    p_notes,
    p_currency,
    p_reference_number
  );

  resolved_payee_id := finance_private.finance_resolve_payee_v1(p_user_id, p_payee_name);
  corrected_payee_name := nullif(pg_catalog.btrim(p_payee_name), '');

  update public.finance_transactions
  set payee_id = resolved_payee_id,
      recipient_reference = nullif(pg_catalog.btrim(p_recipient_reference), ''),
      updated_at = now()
  where id = p_transaction_id
    and user_id = p_user_id
  returning * into updated_row;

  if updated_row.intake_item_id is not null then
    select pg_catalog.left(pg_catalog.coalesce(ocr_normalized_text, ocr_text), 1000)
    into context_text
    from public.finance_intake_items
    where id = updated_row.intake_item_id
      and user_id = p_user_id;
  end if;

  for correction in
    select field_name, previous_value, corrected_value
    from (values
      ('payee_name'::text, to_jsonb(previous_payee_name), to_jsonb(corrected_payee_name)),
      (
        'recipient_reference'::text,
        to_jsonb(previous_row.recipient_reference),
        to_jsonb(updated_row.recipient_reference)
      )
    ) as changes(field_name, previous_value, corrected_value)
    where pg_catalog.coalesce(previous_value, 'null'::jsonb)
          is distinct from pg_catalog.coalesce(corrected_value, 'null'::jsonb)
  loop
    insert into public.finance_corrections (
      user_id,
      transaction_id,
      intake_item_id,
      field_name,
      previous_value,
      corrected_value,
      context_excerpt
    ) values (
      p_user_id,
      updated_row.id,
      updated_row.intake_item_id,
      correction.field_name,
      correction.previous_value,
      correction.corrected_value,
      context_text
    );
  end loop;

  return updated_row;
end;
$function$;

revoke all on table public.dim_finance_payees from public, anon, authenticated;
grant select, insert, update, delete on table public.dim_finance_payees to service_role;

revoke execute on function finance_private.finance_normalize_payee_key(text)
  from public, anon, authenticated;
revoke execute on function finance_private.finance_resolve_payee_v1(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.finance_create_manual_transaction_v1(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, uuid
) from public, anon, authenticated;
revoke execute on function public.finance_confirm_candidate_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, boolean, text, text
) from public, anon, authenticated;
revoke execute on function public.finance_update_transaction_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text
) from public, anon, authenticated;

grant execute on function finance_private.finance_normalize_payee_key(text) to service_role;
grant execute on function finance_private.finance_resolve_payee_v1(uuid, text) to service_role;
grant execute on function public.finance_create_manual_transaction_v1(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, uuid
) to service_role;
grant execute on function public.finance_confirm_candidate_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, boolean, text, text
) to service_role;
grant execute on function public.finance_update_transaction_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text
) to service_role;

comment on table public.dim_finance_payees is
  'User-owned canonical payee names used for exact normalized OCR classification.';
comment on column public.finance_transactions.recipient_reference is
  'User-entered recipient-facing transfer reference. It is not a duplicate key.';
