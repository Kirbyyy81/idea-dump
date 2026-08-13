-- Store recipient references as Finance notes and replace the mutation RPCs directly.

alter table public.finance_transactions
  drop constraint finance_transactions_text_length_check;

alter table public.finance_transactions
  add constraint finance_transactions_text_length_check
    check (
      (merchant is null or pg_catalog.char_length(merchant) <= 500)
      and (notes is null or pg_catalog.char_length(notes) <= 2500)
    );

alter table public.finance_candidate_transactions
  add constraint finance_candidate_transactions_notes_length_check
    check (
      not (payload ? 'notes')
      or payload -> 'notes' = 'null'::jsonb
      or (
        pg_catalog.jsonb_typeof(payload -> 'notes') = 'string'
        and pg_catalog.char_length(payload ->> 'notes') between 1 and 2500
      )
    ) not valid;

update public.finance_transactions
set notes = case
  when nullif(pg_catalog.btrim(recipient_reference), '') is null then notes
  when nullif(pg_catalog.btrim(notes), '') is null then pg_catalog.btrim(recipient_reference)
  when pg_catalog.btrim(recipient_reference) = any (
    pg_catalog.regexp_split_to_array(pg_catalog.btrim(notes), E'\\r?\\n')
  ) then pg_catalog.btrim(notes)
  else pg_catalog.btrim(recipient_reference) || E'\n' || pg_catalog.btrim(notes)
end
where recipient_reference is not null;

with candidate_values as materialized (
  select
    candidates.id,
    nullif(pg_catalog.btrim(candidates.payload ->> 'recipient_reference'), '') as recipient_reference,
    nullif(pg_catalog.btrim(candidates.payload ->> 'notes'), '') as existing_notes
  from public.finance_candidate_transactions candidates
  where candidates.payload ? 'recipient_reference'
), merged_candidates as materialized (
  select
    candidate_values.id,
    case
      when candidate_values.recipient_reference is null then candidate_values.existing_notes
      when candidate_values.existing_notes is null then candidate_values.recipient_reference
      when candidate_values.recipient_reference = any (
        pg_catalog.regexp_split_to_array(candidate_values.existing_notes, E'\\r?\\n')
      ) then candidate_values.existing_notes
      else candidate_values.recipient_reference || E'\n' || candidate_values.existing_notes
    end as notes
  from candidate_values
)
update public.finance_candidate_transactions candidates
set payload = (candidates.payload - 'recipient_reference')
  || case
    when merged_candidates.notes is null then '{}'::jsonb
    else pg_catalog.jsonb_build_object('notes', merged_candidates.notes)
  end,
  updated_at = now()
from merged_candidates
where candidates.id = merged_candidates.id;

alter table public.finance_candidate_transactions
  validate constraint finance_candidate_transactions_notes_length_check;

drop function public.finance_create_manual_transaction_v1(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, uuid
);
drop function public.finance_confirm_candidate_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text, boolean, text, text
);
drop function public.finance_update_transaction_v2(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, text
);

alter table public.finance_transactions
  drop constraint finance_transactions_recipient_reference_check,
  drop column recipient_reference;

create function public.finance_create_manual_transaction_v2(
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
    p_manual_idempotency_key
  )
  returning * into transaction_row;

  return transaction_row;
end;
$function$;

create function public.finance_confirm_candidate_v3(
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
  if p_notes is not null
     and pg_catalog.char_length(pg_catalog.btrim(p_notes)) > 2500 then
    raise exception using errcode = '22023', message = 'Notes must be 2500 characters or fewer';
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

  if coalesce((confirmation ->> 'confirmed')::boolean, false) is false then
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
      updated_at = now()
  where id = transaction_id
    and user_id = p_user_id
  returning * into transaction_row;

  if not found then
    raise exception using errcode = '23514', message = 'Confirmed Finance transaction link is invalid';
  end if;

  if transaction_row.intake_item_id is not null then
    select pg_catalog.left(coalesce(ocr_normalized_text, ocr_text), 1000)
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
        pg_catalog.to_jsonb(nullif(pg_catalog.btrim(p_payee_name), ''))
      ),
      (
        'notes'::text,
        candidate_row.payload -> 'notes',
        pg_catalog.to_jsonb(nullif(pg_catalog.btrim(p_notes), ''))
      )
    ) as changes(field_name, previous_value, corrected_value)
    where coalesce(previous_value, 'null'::jsonb)
          is distinct from coalesce(corrected_value, 'null'::jsonb)
      and not exists (
        select 1
        from public.finance_corrections existing
        where existing.user_id = p_user_id
          and existing.transaction_id = transaction_row.id
          and existing.field_name = changes.field_name
          and coalesce(existing.previous_value, 'null'::jsonb)
              = coalesce(changes.previous_value, 'null'::jsonb)
          and coalesce(existing.corrected_value, 'null'::jsonb)
              = coalesce(changes.corrected_value, 'null'::jsonb)
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

  return pg_catalog.jsonb_set(confirmation, '{transaction}', pg_catalog.to_jsonb(transaction_row), true);
end;
$function$;

create function public.finance_update_transaction_v3(
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
  p_reference_number text
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
begin
  if p_notes is not null
     and pg_catalog.char_length(pg_catalog.btrim(p_notes)) > 2500 then
    raise exception using errcode = '22023', message = 'Notes must be 2500 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('idea-dump:finance-ledger:' || p_user_id::text, 0)
  );

  select transactions.*
  into previous_row
  from public.finance_transactions transactions
  where transactions.id = p_transaction_id
    and transactions.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance transaction not found';
  end if;

  select payees.name
  into previous_payee_name
  from public.dim_finance_payees payees
  where payees.id = previous_row.payee_id
    and payees.user_id = previous_row.user_id;

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
      updated_at = now()
  where id = p_transaction_id
    and user_id = p_user_id
  returning * into updated_row;

  if updated_row.intake_item_id is not null then
    select pg_catalog.left(coalesce(ocr_normalized_text, ocr_text), 1000)
    into context_text
    from public.finance_intake_items
    where id = updated_row.intake_item_id
      and user_id = p_user_id;
  end if;

  if coalesce(pg_catalog.to_jsonb(previous_payee_name), 'null'::jsonb)
     is distinct from coalesce(pg_catalog.to_jsonb(corrected_payee_name), 'null'::jsonb) then
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
      'payee_name',
      pg_catalog.to_jsonb(previous_payee_name),
      pg_catalog.to_jsonb(corrected_payee_name),
      context_text
    );
  end if;

  return updated_row;
end;
$function$;

revoke execute on function public.finance_create_manual_transaction_v2(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, uuid
) from public, anon, authenticated;
revoke execute on function public.finance_confirm_candidate_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, boolean, text, text
) from public, anon, authenticated;
revoke execute on function public.finance_update_transaction_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text
) from public, anon, authenticated;

grant execute on function public.finance_create_manual_transaction_v2(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, uuid
) to service_role;
grant execute on function public.finance_confirm_candidate_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, boolean, text, text
) to service_role;
grant execute on function public.finance_update_transaction_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text
) to service_role;

comment on function public.finance_create_manual_transaction_v2(
  uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, uuid
) is 'Creates an idempotent manual Finance transaction, resolving the optional payee atomically.';
comment on function public.finance_confirm_candidate_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text, boolean, text, text
) is 'Confirms a Finance candidate atomically with payee resolution and recipient references stored in notes.';
comment on function public.finance_update_transaction_v3(
  uuid, uuid, uuid, uuid, text, numeric, text, text, date, text, text, text
) is 'Updates a Finance transaction atomically and records payee changes using text values.';

notify pgrst, 'reload schema';
