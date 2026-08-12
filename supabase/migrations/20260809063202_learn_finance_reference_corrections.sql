create table public.finance_field_learning_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  field_name text not null,
  transform_type text not null,
  transform_value text,
  evidence_count integer not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint finance_field_learning_rules_source_user_fkey
    foreign key (source_id, user_id)
    references public.dim_finance_sources(id, user_id)
    on delete cascade,
  constraint finance_field_learning_rules_field_name_check
    check (field_name = 'reference_number'),
  constraint finance_field_learning_rules_transform_type_check
    check (transform_type = any (array[
      'strip_prefix'::text,
      'strip_suffix'::text,
      'digits_only'::text,
      'alphanumeric_only'::text
    ])),
  constraint finance_field_learning_rules_transform_value_check
    check (
      (
        transform_type in ('strip_prefix', 'strip_suffix')
        and transform_value is not null
        and transform_value = public.finance_normalize_reference_number(transform_value)
        and char_length(transform_value) between 1 and 100
      )
      or (
        transform_type in ('digits_only', 'alphanumeric_only')
        and transform_value is null
      )
    ),
  constraint finance_field_learning_rules_evidence_count_check
    check (evidence_count >= 3)
);

create unique index finance_field_learning_rules_identity_idx
  on public.finance_field_learning_rules (
    user_id,
    source_id,
    field_name,
    transform_type,
    coalesce(transform_value, '')
  );

create index finance_field_learning_rules_active_lookup_idx
  on public.finance_field_learning_rules (
    user_id,
    source_id,
    field_name,
    evidence_count desc,
    created_at,
    id
  )
  where is_active = true;

create index finance_field_learning_rules_source_user_idx
  on public.finance_field_learning_rules (source_id, user_id);

create index finance_corrections_learning_evidence_idx
  on public.finance_corrections (
    field_name,
    user_id,
    transaction_id,
    created_at desc,
    id desc
  )
  where transaction_id is not null
    and field_name in ('category_id', 'reference_number');

alter table public.finance_field_learning_rules enable row level security;

create policy server_only_deny
  on public.finance_field_learning_rules
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.finance_field_learning_rules
  from public, anon, authenticated;
grant select on table public.finance_field_learning_rules
  to service_role;

comment on table public.finance_field_learning_rules is
  'Source-specific deterministic field transforms learned from repeated Finance review corrections.';
comment on column public.finance_field_learning_rules.evidence_count is
  'Distinct confirmed transactions whose latest correction supports this transform. A minimum of three is required.';

create or replace function public.finance_refresh_rule_suggestions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  category_inserted_rows integer := 0;
  reference_inserted_rows integer := 0;
begin
  with latest_category_corrections as materialized (
    select distinct on (corrections.user_id, corrections.transaction_id)
      corrections.id,
      corrections.user_id,
      corrections.transaction_id,
      corrections.corrected_value
    from public.finance_corrections corrections
    where corrections.field_name = 'category_id'
      and corrections.transaction_id is not null
    order by
      corrections.user_id,
      corrections.transaction_id,
      corrections.created_at desc,
      corrections.id desc
  ), evidence_rows as materialized (
    select
      latest.user_id,
      latest.transaction_id,
      public.finance_normalize_merchant_key(transactions.merchant) as merchant_key,
      lower(regexp_replace(btrim(transactions.merchant), '[[:space:]]+', ' ', 'g')) as normalized_pattern,
      transactions.category_id,
      transactions.direction,
      transactions.source_id
    from latest_category_corrections latest
    join public.finance_transactions transactions
      on transactions.id = latest.transaction_id
     and transactions.user_id = latest.user_id
     and transactions.status = 'confirmed'
    join public.dim_finance_categories categories
      on categories.id = transactions.category_id
     and categories.user_id = transactions.user_id
     and categories.type = transactions.direction
     and categories.is_archived = false
    join public.dim_finance_sources sources
      on sources.id = transactions.source_id
     and sources.user_id = transactions.user_id
     and sources.is_archived = false
    where transactions.category_id = nullif(latest.corrected_value #>> '{}', '')::uuid
      and transactions.merchant is not null
      and char_length(public.finance_normalize_merchant_key(transactions.merchant)) >= 3
      and transactions.direction in ('expense', 'income')
  ), category_counts as materialized (
    select
      evidence_rows.user_id,
      evidence_rows.merchant_key,
      min(evidence_rows.normalized_pattern) as normalized_pattern,
      evidence_rows.category_id,
      evidence_rows.direction,
      evidence_rows.source_id,
      count(distinct evidence_rows.transaction_id)::integer as evidence_count
    from evidence_rows
    group by
      evidence_rows.user_id,
      evidence_rows.merchant_key,
      evidence_rows.category_id,
      evidence_rows.direction,
      evidence_rows.source_id
  ), unambiguous_keys as materialized (
    select
      category_counts.user_id,
      category_counts.merchant_key,
      category_counts.direction,
      category_counts.source_id
    from category_counts
    group by
      category_counts.user_id,
      category_counts.merchant_key,
      category_counts.direction,
      category_counts.source_id
    having count(*) = 1
  ), eligible as materialized (
    select category_counts.*
    from category_counts
    join unambiguous_keys using (user_id, merchant_key, direction, source_id)
    where category_counts.evidence_count >= 3
  ), supported_updates as (
    update public.finance_rules rules
    set learning_evidence_count = eligible.evidence_count,
        updated_at = now()
    from eligible
    where rules.auto_created_at is not null
      and rules.source = 'learning'
      and rules.match_type = 'merchant_alias'
      and rules.user_id = eligible.user_id
      and public.finance_normalize_merchant_key(rules.pattern) = eligible.merchant_key
      and rules.category_id = eligible.category_id
      and rules.direction = eligible.direction
      and rules.source_id = eligible.source_id
      and rules.learning_evidence_count is distinct from eligible.evidence_count
    returning rules.id
  ), unsupported_deactivations as (
    update public.finance_rules rules
    set is_active = false,
        updated_at = now()
    where rules.auto_created_at is not null
      and rules.source = 'learning'
      and rules.match_type = 'merchant_alias'
      and rules.is_active = true
      and not exists (
        select 1
        from eligible
        where eligible.user_id = rules.user_id
          and eligible.merchant_key = public.finance_normalize_merchant_key(rules.pattern)
          and eligible.category_id = rules.category_id
          and eligible.direction = rules.direction
          and eligible.source_id = rules.source_id
      )
    returning rules.id
  ), inserted as (
    insert into public.finance_rules (
      user_id,
      name,
      match_type,
      pattern,
      category_id,
      direction,
      priority,
      is_active,
      source,
      source_id,
      auto_created_at,
      learning_evidence_count
    )
    select
      eligible.user_id,
      initcap(left(eligible.normalized_pattern, 120)),
      'merchant_alias',
      eligible.normalized_pattern,
      eligible.category_id,
      eligible.direction,
      100,
      true,
      'learning',
      eligible.source_id,
      now(),
      eligible.evidence_count
    from eligible
    where not exists (
      select 1
      from public.finance_rules existing
      where existing.user_id = eligible.user_id
        and existing.is_active = true
        and existing.match_type = 'merchant_alias'
        and public.finance_normalize_merchant_key(existing.pattern) = eligible.merchant_key
        and (
          (
            existing.source <> 'learning'
            and existing.category_id = eligible.category_id
            and existing.direction = eligible.direction
            and (existing.source_id is null or existing.source_id = eligible.source_id)
          )
          or (
            existing.auto_created_at is not null
            and existing.category_id = eligible.category_id
            and existing.direction = eligible.direction
            and existing.source_id = eligible.source_id
          )
        )
    )
    on conflict do nothing
    returning id
  )
  select count(*)::integer into category_inserted_rows
  from inserted;

  with initial_reference_corrections as materialized (
    select
      corrections.user_id,
      corrections.transaction_id,
      public.finance_normalize_reference_number(corrections.previous_value #>> '{}') as previous_reference,
      public.finance_normalize_reference_number(corrections.corrected_value #>> '{}') as corrected_reference
    from public.finance_corrections corrections
    join public.finance_transactions transactions
      on transactions.id = corrections.transaction_id
     and transactions.user_id = corrections.user_id
     and transactions.status = 'confirmed'
     and corrections.created_at = transactions.created_at
    where corrections.field_name = 'reference_number'
      and corrections.transaction_id is not null
      and jsonb_typeof(corrections.previous_value) = 'string'
      and jsonb_typeof(corrections.corrected_value) = 'string'
  ), reference_evidence as materialized (
    select
      latest.user_id,
      latest.transaction_id,
      transactions.source_id,
      latest.previous_reference,
      latest.corrected_reference
    from initial_reference_corrections latest
    join public.finance_transactions transactions
      on transactions.id = latest.transaction_id
     and transactions.user_id = latest.user_id
     and transactions.status = 'confirmed'
    join public.dim_finance_sources sources
      on sources.id = transactions.source_id
     and sources.user_id = transactions.user_id
     and sources.is_archived = false
    where latest.previous_reference is not null
      and latest.corrected_reference is not null
      and latest.previous_reference <> latest.corrected_reference
      and char_length(latest.previous_reference) between 5 and 200
      and char_length(latest.corrected_reference) between 5 and 200
  ), candidate_transforms as materialized (
    select
      evidence.user_id,
      evidence.transaction_id,
      evidence.source_id,
      transforms.transform_type,
      transforms.transform_value
    from reference_evidence evidence
    cross join lateral (
      values
        (
          'strip_prefix'::text,
          left(
            evidence.previous_reference,
            char_length(evidence.previous_reference) - char_length(evidence.corrected_reference)
          ),
          char_length(evidence.previous_reference) > char_length(evidence.corrected_reference)
          and right(evidence.previous_reference, char_length(evidence.corrected_reference)) = evidence.corrected_reference
        ),
        (
          'strip_suffix'::text,
          right(
            evidence.previous_reference,
            char_length(evidence.previous_reference) - char_length(evidence.corrected_reference)
          ),
          char_length(evidence.previous_reference) > char_length(evidence.corrected_reference)
          and left(evidence.previous_reference, char_length(evidence.corrected_reference)) = evidence.corrected_reference
        ),
        (
          'digits_only'::text,
          null::text,
          regexp_replace(evidence.previous_reference, '[^0-9]+', '', 'g') = evidence.corrected_reference
        ),
        (
          'alphanumeric_only'::text,
          null::text,
          regexp_replace(evidence.previous_reference, '[^A-Z0-9]+', '', 'g') = evidence.corrected_reference
          and regexp_replace(evidence.previous_reference, '[^0-9]+', '', 'g') <> evidence.corrected_reference
        )
    ) as transforms(transform_type, transform_value, is_match)
    where transforms.is_match
      and (
        transforms.transform_value is null
        or char_length(transforms.transform_value) between 1 and 100
      )
  ), transform_counts as materialized (
    select
      candidate_transforms.user_id,
      candidate_transforms.source_id,
      candidate_transforms.transform_type,
      candidate_transforms.transform_value,
      count(distinct candidate_transforms.transaction_id)::integer as evidence_count
    from candidate_transforms
    group by
      candidate_transforms.user_id,
      candidate_transforms.source_id,
      candidate_transforms.transform_type,
      candidate_transforms.transform_value
  ), reviewed_references as materialized (
    select
      candidates.user_id,
      candidates.id as candidate_id,
      transactions.source_id,
      public.finance_normalize_reference_number(
        coalesce(
          candidates.payload ->> 'reference_number',
          candidates.payload ->> 'reference'
        )
      ) as parsed_reference,
      case
        when initial_correction.id is null then
          public.finance_normalize_reference_number(
            coalesce(
              candidates.payload ->> 'reference_number',
              candidates.payload ->> 'reference'
            )
          )
        else public.finance_normalize_reference_number(initial_correction.corrected_value #>> '{}')
      end as confirmed_reference
    from public.finance_candidate_transactions candidates
    join public.finance_transactions transactions
      on transactions.id = candidates.confirmed_transaction_id
     and transactions.user_id = candidates.user_id
     and transactions.intake_item_id = candidates.intake_item_id
     and transactions.status = 'confirmed'
    join public.dim_finance_sources sources
      on sources.id = transactions.source_id
     and sources.user_id = transactions.user_id
     and sources.is_archived = false
    left join public.finance_corrections initial_correction
      on initial_correction.transaction_id = transactions.id
     and initial_correction.user_id = transactions.user_id
     and initial_correction.intake_item_id = transactions.intake_item_id
     and initial_correction.field_name = 'reference_number'
     and initial_correction.created_at = transactions.created_at
    where candidates.status = 'accepted'
      and candidates.duplicate_outcome = 'none'
  ), applied_reviews as materialized (
    select
      transform_counts.user_id,
      transform_counts.source_id,
      transform_counts.transform_type,
      transform_counts.transform_value,
      reviewed_references.candidate_id,
      reviewed_references.confirmed_reference,
      case transform_counts.transform_type
        when 'strip_prefix' then btrim(substr(
          reviewed_references.parsed_reference,
          char_length(transform_counts.transform_value) + 1
        ))
        when 'strip_suffix' then btrim(left(
          reviewed_references.parsed_reference,
          char_length(reviewed_references.parsed_reference)
            - char_length(transform_counts.transform_value)
        ))
        when 'digits_only' then regexp_replace(
          reviewed_references.parsed_reference,
          '[^0-9]+',
          '',
          'g'
        )
        when 'alphanumeric_only' then regexp_replace(
          reviewed_references.parsed_reference,
          '[^A-Z0-9]+',
          '',
          'g'
        )
      end as transformed_reference
    from transform_counts
    join reviewed_references
      on reviewed_references.user_id = transform_counts.user_id
     and reviewed_references.source_id = transform_counts.source_id
    where reviewed_references.parsed_reference is not null
      and (
        (
          transform_counts.transform_type = 'strip_prefix'
          and left(
            reviewed_references.parsed_reference,
            char_length(transform_counts.transform_value)
          ) = transform_counts.transform_value
        )
        or (
          transform_counts.transform_type = 'strip_suffix'
          and right(
            reviewed_references.parsed_reference,
            char_length(transform_counts.transform_value)
          ) = transform_counts.transform_value
        )
        or (
          transform_counts.transform_type = 'digits_only'
          and regexp_replace(reviewed_references.parsed_reference, '[^0-9]+', '', 'g')
            <> reviewed_references.parsed_reference
        )
        or (
          transform_counts.transform_type = 'alphanumeric_only'
          and regexp_replace(reviewed_references.parsed_reference, '[^A-Z0-9]+', '', 'g')
            <> reviewed_references.parsed_reference
        )
      )
  ), eligible as materialized (
    select transform_counts.*
    from transform_counts
    where transform_counts.evidence_count >= 3
      and not exists (
        select 1
        from applied_reviews
        where applied_reviews.user_id = transform_counts.user_id
          and applied_reviews.source_id = transform_counts.source_id
          and applied_reviews.transform_type = transform_counts.transform_type
          and applied_reviews.transform_value is not distinct from transform_counts.transform_value
          and applied_reviews.transformed_reference is distinct from applied_reviews.confirmed_reference
      )
  ), supported_updates as (
    update public.finance_field_learning_rules rules
    set evidence_count = eligible.evidence_count,
        is_active = true,
        updated_at = now()
    from eligible
    where rules.user_id = eligible.user_id
      and rules.source_id = eligible.source_id
      and rules.field_name = 'reference_number'
      and rules.transform_type = eligible.transform_type
      and rules.transform_value is not distinct from eligible.transform_value
      and (
        rules.evidence_count is distinct from eligible.evidence_count
        or rules.is_active = false
      )
    returning rules.id
  ), unsupported_deactivations as (
    update public.finance_field_learning_rules rules
    set is_active = false,
        updated_at = now()
    where rules.field_name = 'reference_number'
      and rules.is_active = true
      and not exists (
        select 1
        from eligible
        where rules.user_id = eligible.user_id
          and rules.source_id = eligible.source_id
          and rules.transform_type = eligible.transform_type
          and rules.transform_value is not distinct from eligible.transform_value
      )
    returning rules.id
  ), inserted as (
    insert into public.finance_field_learning_rules (
      user_id,
      source_id,
      field_name,
      transform_type,
      transform_value,
      evidence_count
    )
    select
      eligible.user_id,
      eligible.source_id,
      'reference_number',
      eligible.transform_type,
      eligible.transform_value,
      eligible.evidence_count
    from eligible
    where not exists (
      select 1
      from public.finance_field_learning_rules existing
      where existing.user_id = eligible.user_id
        and existing.source_id = eligible.source_id
        and existing.field_name = 'reference_number'
        and existing.transform_type = eligible.transform_type
        and existing.transform_value is not distinct from eligible.transform_value
    )
    on conflict do nothing
    returning id
  )
  select count(*)::integer into reference_inserted_rows
  from inserted;

  return category_inserted_rows + reference_inserted_rows;
end;
$function$;

comment on function public.finance_refresh_rule_suggestions() is
  'Cron-only learning entry point. Refreshes category rules and source-specific reference transforms after three initial review corrections and zero contradictory reviewed outcomes.';

revoke execute on function public.finance_refresh_rule_suggestions()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
