-- Finance data-contract, integrity, and transactional workflow remediation.

create extension if not exists pg_cron with schema pg_catalog;

-- Abort before changing data if any final constraint would reject live rows.
do $preflight$
declare
  violation_count bigint;
begin
  select count(*) into violation_count
  from public.finance_transactions
  where direction = 'transfer';
  if violation_count > 1 then
    raise exception 'Expected at most one test transfer transaction, found %', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rules
  where direction = 'transfer';
  if violation_count <> 0 then
    raise exception 'Refusing to reclassify % unexpected transfer rules', violation_count;
  end if;

  select count(*) into violation_count
  from (
    select intake_item_id
    from public.finance_transactions
    where intake_item_id is not null
    group by intake_item_id
    having count(*) > 1
  ) duplicates;
  if violation_count <> 0 then
    raise exception 'Cannot enforce one transaction per intake: % duplicate intake groups', violation_count;
  end if;

  select count(*) into violation_count
  from (
    select intake_item_id
    from public.finance_candidate_transactions
    group by intake_item_id
    having count(*) > 1
  ) duplicates;
  if violation_count <> 0 then
    raise exception 'Cannot enforce one candidate per intake: % duplicate intake groups', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_candidate_transactions candidates
  where candidates.status = 'accepted'
    and not exists (
      select 1
      from public.finance_transactions transactions
      where transactions.intake_item_id = candidates.intake_item_id
        and transactions.user_id = candidates.user_id
    );
  if violation_count <> 0 then
    raise exception 'Cannot backfill accepted candidates: % have no transaction', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_candidate_transactions candidates
  where candidates.status = 'pending'
    and exists (
      select 1
      from public.finance_transactions transactions
      where transactions.intake_item_id = candidates.intake_item_id
        and transactions.user_id = candidates.user_id
    );
  if violation_count <> 0 then
    raise exception 'Cannot enforce confirmation state: % pending candidates already have a transaction', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_intake_items intakes
  where intakes.status = 'completed'
    and not exists (
      select 1
      from public.finance_candidate_transactions candidates
      join public.finance_transactions transactions
        on transactions.intake_item_id = candidates.intake_item_id
       and transactions.user_id = candidates.user_id
      where candidates.intake_item_id = intakes.id
        and candidates.user_id = intakes.user_id
        and candidates.status = 'accepted'
    );
  if violation_count <> 0 then
    raise exception 'Cannot enforce completed intake state: % rows lack an accepted transaction', violation_count;
  end if;

  select count(*) into violation_count
  from (
    select user_id, type, lower(btrim(name))
    from public.finance_categories
    group by user_id, type, lower(btrim(name))
    having count(*) > 1
  ) duplicates;
  if violation_count <> 0 then
    raise exception 'Cannot enforce canonical category names: % duplicate groups', violation_count;
  end if;

  select count(*) into violation_count
  from (
    select user_id, lower(btrim(name))
    from public.finance_sources
    group by user_id, lower(btrim(name))
    having count(*) > 1
  ) duplicates;
  if violation_count <> 0 then
    raise exception 'Cannot enforce canonical source names: % duplicate groups', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_candidate_transactions
  where confidence is not null
    and confidence not between 0 and 1;
  if violation_count <> 0 then
    raise exception 'Cannot constrain candidate confidence: % out-of-range rows', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_candidate_transactions candidates
  join public.finance_intake_items intakes on intakes.id = candidates.intake_item_id
  where candidates.user_id <> intakes.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe candidate/intake FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_candidate_transactions candidates
  left join public.finance_rules rules on rules.id = candidates.matched_rule_id
  where candidates.matched_rule_id is not null
    and (rules.id is null or candidates.user_id <> rules.user_id);
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe candidate/rule FK: % invalid references', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_transactions transactions
  join public.finance_sources sources on sources.id = transactions.source_id
  where transactions.user_id <> sources.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe transaction/source FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_transactions transactions
  join public.finance_categories categories on categories.id = transactions.category_id
  where transactions.user_id <> categories.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe transaction/category FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_transactions transactions
  join public.finance_categories categories on categories.id = transactions.category_id
  where categories.type <> case
    when transactions.direction = 'transfer' then 'income'
    else transactions.direction
  end;
  if violation_count <> 0 then
    raise exception 'Cannot enforce transaction/category direction: % mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_transactions transactions
  join public.finance_intake_items intakes on intakes.id = transactions.intake_item_id
  where transactions.user_id <> intakes.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe transaction/intake FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rules rules
  join public.finance_sources sources on sources.id = rules.source_id
  where rules.user_id <> sources.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe rule/source FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rules rules
  join public.finance_categories categories on categories.id = rules.category_id
  where rules.user_id <> categories.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe rule/category FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rules rules
  join public.finance_categories categories on categories.id = rules.category_id
  where rules.direction is not null
    and categories.type <> case
      when rules.direction = 'transfer' then 'income'
      else rules.direction
    end;
  if violation_count <> 0 then
    raise exception 'Cannot enforce rule/category direction: % mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_corrections corrections
  join public.finance_transactions transactions on transactions.id = corrections.transaction_id
  where corrections.user_id <> transactions.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe correction/transaction FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_corrections corrections
  join public.finance_intake_items intakes on intakes.id = corrections.intake_item_id
  where corrections.user_id <> intakes.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe correction/intake FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_processing_events events
  join public.finance_intake_items intakes on intakes.id = events.intake_item_id
  where events.user_id <> intakes.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe event/intake FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rule_suggestions suggestions
  join public.finance_categories categories on categories.id = suggestions.category_id
  where suggestions.user_id <> categories.user_id;
  if violation_count <> 0 then
    raise exception 'Cannot add tenant-safe suggestion/category FK: % ownership mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from public.finance_rule_suggestions suggestions
  join public.finance_categories categories on categories.id = suggestions.category_id
  where categories.type <> suggestions.direction;
  if violation_count <> 0 then
    raise exception 'Cannot enforce suggestion/category direction: % mismatches', violation_count;
  end if;

  select count(*) into violation_count
  from (
    select 1 from public.finance_sources
    where char_length(btrim(name)) not between 1 and 120
    union all
    select 1 from public.finance_categories
    where char_length(btrim(name)) not between 1 and 120
       or char_length(color) > 50
       or char_length(icon) > 100
    union all
    select 1 from public.finance_rules
    where char_length(btrim(name)) not between 1 and 120
       or char_length(btrim(pattern)) not between 1 and 500
    union all
    select 1 from public.finance_rule_suggestions
    where char_length(btrim(name)) not between 1 and 120
       or char_length(btrim(pattern)) not between 1 and 500
    union all
    select 1 from public.finance_transactions
    where char_length(merchant) > 500
       or char_length(notes) > 2000
  ) invalid_text;
  if violation_count <> 0 then
    raise exception 'Cannot add Finance text bounds: % rows exceed the v1 contract', violation_count;
  end if;

  with candidate_refs as (
    select
      candidates.user_id,
      nullif(candidates.payload ->> 'source_id', '') as source_text,
      nullif(candidates.payload ->> 'category_id', '') as category_text,
      nullif(candidates.payload ->> 'direction', '') as direction
    from public.finance_candidate_transactions candidates
  ), parsed_refs as (
    select
      candidate_refs.*,
      case
        when source_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then source_text::uuid
      end as source_id,
      case
        when category_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then category_text::uuid
      end as category_id
    from candidate_refs
  )
  select count(*) into violation_count
  from parsed_refs
  where (source_text is not null and (
      source_id is null
      or not exists (
        select 1
        from public.finance_sources sources
        where sources.id = parsed_refs.source_id
          and sources.user_id = parsed_refs.user_id
      )
    ))
    or (category_text is not null and (
      category_id is null
      or not exists (
        select 1
        from public.finance_categories categories
        where categories.id = parsed_refs.category_id
          and categories.user_id = parsed_refs.user_id
      )
    ))
    or (direction is not null and direction not in ('expense', 'income'))
    or (category_id is not null and direction is not null and not exists (
      select 1
      from public.finance_categories categories
      where categories.id = parsed_refs.category_id
        and categories.user_id = parsed_refs.user_id
        and categories.type = parsed_refs.direction
    ));
  if violation_count <> 0 then
    raise exception 'Cannot enforce candidate payload references: % candidates contain invalid Finance dimensions', violation_count;
  end if;

  with duplicate_refs as (
    select
      candidates.user_id,
      nullif(candidates.payload ->> 'duplicate_transaction_id', '') as duplicate_text
    from public.finance_candidate_transactions candidates
  ), parsed_refs as (
    select
      duplicate_refs.*,
      case
        when duplicate_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then duplicate_text::uuid
      end as duplicate_transaction_id
    from duplicate_refs
  )
  select count(*) into violation_count
  from parsed_refs
  where duplicate_text is not null
    and (
      duplicate_transaction_id is null
      or not exists (
        select 1
        from public.finance_transactions transactions
        where transactions.id = parsed_refs.duplicate_transaction_id
          and transactions.user_id = parsed_refs.user_id
          and transactions.status = 'confirmed'
      )
    );
  if violation_count <> 0 then
    raise exception 'Cannot enforce duplicate references: % candidates contain invalid Finance transaction IDs', violation_count;
  end if;

  with correction_refs as (
    select
      corrections.user_id,
      corrections.field_name,
      values_to_check.value_text
    from public.finance_corrections corrections
    cross join lateral (
      values
        (corrections.previous_value #>> '{}'),
        (corrections.corrected_value #>> '{}')
    ) as values_to_check(value_text)
    where corrections.field_name in ('source_id', 'category_id')
      and values_to_check.value_text is not null
  ), parsed_refs as (
    select
      correction_refs.*,
      case
        when value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then value_text::uuid
      end as reference_id
    from correction_refs
  )
  select count(*) into violation_count
  from parsed_refs
  where reference_id is null
    or (
      field_name = 'source_id'
      and not exists (
        select 1
        from public.finance_sources sources
        where sources.id = parsed_refs.reference_id
          and sources.user_id = parsed_refs.user_id
      )
    )
    or (
      field_name = 'category_id'
      and not exists (
        select 1
        from public.finance_categories categories
        where categories.id = parsed_refs.reference_id
          and categories.user_id = parsed_refs.user_id
      )
    );
  if violation_count <> 0 then
    raise exception 'Cannot enforce correction payload references: % corrections contain invalid Finance dimensions', violation_count;
  end if;
end;
$preflight$;

-- The single live transfer is test data and is deliberately reclassified in
-- place. No legacy copy is created, per the product decision.
update public.finance_transactions
set direction = 'income',
    updated_at = now()
where direction = 'transfer';

update public.finance_rules
set direction = 'income',
    updated_at = now()
where direction = 'transfer';

alter table public.finance_transactions
  drop constraint finance_transactions_direction_check,
  add constraint finance_transactions_direction_check
    check (direction = any (array['expense'::text, 'income'::text]));

alter table public.finance_rules
  drop constraint finance_rules_direction_check,
  add constraint finance_rules_direction_check
    check (direction = any (array['expense'::text, 'income'::text]));

-- Durable OCR contract. ocr_text remains as a compatibility field.
alter table public.finance_intake_items
  add column ocr_raw_text text,
  add column ocr_normalized_text text,
  add column ocr_confidence numeric(5,2),
  add column ocr_text_hash text,
  add column normalizer_version integer;

update public.finance_intake_items
set ocr_raw_text = ocr_text,
    ocr_normalized_text = ocr_text,
    ocr_text_hash = encode(sha256(convert_to(ocr_text, 'UTF8')), 'hex'),
    normalizer_version = 0
where ocr_text is not null;

alter table public.finance_intake_items
  add constraint finance_intake_items_ocr_confidence_check
    check (ocr_confidence is null or ocr_confidence between 0 and 100),
  add constraint finance_intake_items_ocr_text_hash_check
    check (ocr_text_hash is null or ocr_text_hash ~ '^[0-9a-f]{64}$'),
  add constraint finance_intake_items_normalizer_version_check
    check (normalizer_version is null or normalizer_version >= 0);

-- Keep the database-owned duplicate key identical to the application's
-- NFKC/trim/uppercase reference contract, including compatibility characters.
create function public.finance_normalize_reference_number(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select pg_catalog.upper(nullif(pg_catalog.btrim(normalize(value, NFKC)), ''))
$function$;

-- Explicit ledger currency/reference contract. The trusted application exposes
-- only MYR in v1, while the schema keeps a validated ISO-style code.
alter table public.finance_transactions
  add column currency text,
  add column reference_number text;

update public.finance_transactions
set currency = 'MYR'
where currency is null;

alter table public.finance_transactions
  alter column currency set default 'MYR',
  alter column currency set not null,
  add constraint finance_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  add constraint finance_transactions_reference_number_check
    check (
      reference_number is null
      or (
        reference_number = public.finance_normalize_reference_number(reference_number)
        and reference_number <> ''
        and char_length(reference_number) <= 200
      )
    );

alter table public.finance_sources
  add constraint finance_sources_name_length_check
    check (char_length(btrim(name)) between 1 and 120);

alter table public.finance_categories
  add constraint finance_categories_text_length_check
    check (
      char_length(btrim(name)) between 1 and 120
      and (color is null or char_length(color) <= 50)
      and (icon is null or char_length(icon) <= 100)
    );

alter table public.finance_rules
  add constraint finance_rules_text_length_check
    check (
      char_length(btrim(name)) between 1 and 120
      and char_length(btrim(pattern)) between 1 and 500
    );

alter table public.finance_rule_suggestions
  add constraint finance_rule_suggestions_text_length_check
    check (
      char_length(btrim(name)) between 1 and 120
      and char_length(btrim(pattern)) between 1 and 500
    );

alter table public.finance_transactions
  add constraint finance_transactions_text_length_check
    check (
      (merchant is null or char_length(merchant) <= 500)
      and (notes is null or char_length(notes) <= 2000)
    );

-- Candidate workflow, duplicate assessment, and idempotent ledger link.
alter table public.finance_candidate_transactions
  add column confirmed_transaction_id uuid,
  add column duplicate_outcome text default 'none' not null,
  add column duplicate_score numeric(5,2),
  add column duplicate_signals text[] default '{}'::text[] not null,
  add column duplicate_explanation text,
  add column duplicate_checked_at timestamp with time zone;

update public.finance_candidate_transactions candidates
set confirmed_transaction_id = transactions.id
from public.finance_transactions transactions
where candidates.status = 'accepted'
  and transactions.intake_item_id = candidates.intake_item_id
  and transactions.user_id = candidates.user_id;

update public.finance_candidate_transactions
set duplicate_outcome = 'possible'
where duplicate_outcome = 'none'
  and nullif(payload ->> 'duplicate_transaction_id', '') is not null;

alter table public.finance_candidate_transactions
  add constraint finance_candidate_transactions_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  add constraint finance_candidate_transactions_confidence_check
    check (confidence is null or confidence between 0 and 1),
  add constraint finance_candidate_transactions_duplicate_outcome_check
    check (duplicate_outcome = any (array['none'::text, 'possible'::text, 'strong'::text])),
  add constraint finance_candidate_transactions_duplicate_score_check
    check (duplicate_score is null or duplicate_score between 0 and 100),
  add constraint finance_candidate_transactions_duplicate_signals_check
    check (duplicate_signals <@ array[
      'image_hash'::text,
      'ocr_text_hash'::text,
      'reference_number'::text,
      'amount'::text,
      'transaction_date'::text,
      'source'::text,
      'merchant'::text
    ]),
  add constraint finance_candidate_transactions_duplicate_explanation_check
    check (duplicate_explanation is null or char_length(duplicate_explanation) <= 2000);

-- Pending rule suggestions can be edited before transactional acceptance.
alter table public.finance_rule_suggestions
  add column match_type text default 'merchant_alias' not null,
  add column source_id uuid,
  add column priority integer default 100 not null,
  add constraint finance_rule_suggestions_match_type_check
    check (match_type = any (array[
      'exact_phrase'::text,
      'merchant_alias'::text,
      'keyword'::text,
      'account_hint'::text
    ]));

-- These fields let the Rules page identify automatically learned rules without
-- introducing a notification table.
alter table public.finance_rules
  add column auto_created_at timestamp with time zone,
  add column learning_evidence_count integer,
  add constraint finance_rules_learning_evidence_count_check
    check (learning_evidence_count is null or learning_evidence_count >= 1);

-- Case-insensitive, whitespace-trimmed names make user-selected virtual
-- category suggestions and management operations deterministic.
create unique index finance_categories_user_type_name_canonical_idx
  on public.finance_categories (user_id, type, lower(btrim(name)));

create unique index finance_sources_user_name_canonical_idx
  on public.finance_sources (user_id, lower(btrim(name)));

create unique index finance_transactions_unique_intake_idx
  on public.finance_transactions (intake_item_id)
  where intake_item_id is not null;

create unique index finance_candidate_transactions_unique_intake_idx
  on public.finance_candidate_transactions (intake_item_id);

create index finance_intake_items_user_ocr_hash_idx
  on public.finance_intake_items (user_id, ocr_text_hash)
  where ocr_text_hash is not null;

create index finance_transactions_user_reference_idx
  on public.finance_transactions (user_id, source_id, currency, reference_number)
  where status = 'confirmed'
    and reference_number is not null;

create index finance_transactions_duplicate_fields_idx
  on public.finance_transactions (user_id, currency, amount, transaction_date)
  where status = 'confirmed';

-- Composite parent keys for tenant-safe foreign keys.
alter table public.finance_sources
  add constraint finance_sources_id_user_id_key unique (id, user_id);

alter table public.finance_categories
  add constraint finance_categories_id_user_id_key unique (id, user_id);

alter table public.finance_intake_items
  add constraint finance_intake_items_id_user_id_key unique (id, user_id);

alter table public.finance_rules
  add constraint finance_rules_id_user_id_key unique (id, user_id);

alter table public.finance_transactions
  add constraint finance_transactions_id_user_id_key unique (id, user_id),
  add constraint finance_transactions_id_intake_user_key
    unique (id, intake_item_id, user_id);

-- Replace ID-only relationships with tenant-safe relationships while retaining
-- the existing constraint names used by PostgREST relationship discovery.
-- Dimension references use deferred NO ACTION: explicit source/category
-- deletion still goes through the unreferenced-check RPCs, while a cascading
-- auth.users deletion may remove dimensions and their children in any trigger
-- order as long as the whole transaction ends without references.
alter table public.finance_transactions
  drop constraint finance_transactions_source_id_fkey,
  drop constraint finance_transactions_category_id_fkey,
  drop constraint finance_transactions_intake_item_id_fkey,
  add constraint finance_transactions_source_id_fkey
    foreign key (source_id, user_id)
    references public.finance_sources (id, user_id)
    on delete no action deferrable initially deferred,
  add constraint finance_transactions_category_id_fkey
    foreign key (category_id, user_id)
    references public.finance_categories (id, user_id)
    on delete no action deferrable initially deferred,
  add constraint finance_transactions_intake_item_id_fkey
    foreign key (intake_item_id, user_id)
    references public.finance_intake_items (id, user_id)
    on delete set null (intake_item_id);

alter table public.finance_candidate_transactions
  drop constraint finance_candidate_transactions_intake_item_id_fkey,
  add constraint finance_candidate_transactions_intake_item_id_fkey
    foreign key (intake_item_id, user_id)
    references public.finance_intake_items (id, user_id)
    on delete cascade,
  add constraint finance_candidate_transactions_matched_rule_id_fkey
    foreign key (matched_rule_id, user_id)
    references public.finance_rules (id, user_id)
    on delete set null (matched_rule_id),
  add constraint finance_candidate_transactions_confirmed_transaction_id_fkey
    foreign key (confirmed_transaction_id, intake_item_id, user_id)
    references public.finance_transactions (id, intake_item_id, user_id)
    on delete set null (confirmed_transaction_id)
    deferrable initially deferred;

alter table public.finance_rules
  drop constraint finance_rules_category_id_fkey,
  drop constraint finance_rules_source_id_fkey,
  add constraint finance_rules_category_id_fkey
    foreign key (category_id, user_id)
    references public.finance_categories (id, user_id)
    on delete no action deferrable initially deferred,
  add constraint finance_rules_source_id_fkey
    foreign key (source_id, user_id)
    references public.finance_sources (id, user_id)
    on delete no action deferrable initially deferred;

alter table public.finance_corrections
  drop constraint finance_corrections_transaction_id_fkey,
  drop constraint finance_corrections_intake_item_id_fkey,
  add constraint finance_corrections_transaction_id_fkey
    foreign key (transaction_id, user_id)
    references public.finance_transactions (id, user_id)
    on delete set null (transaction_id),
  add constraint finance_corrections_intake_item_id_fkey
    foreign key (intake_item_id, user_id)
    references public.finance_intake_items (id, user_id)
    on delete set null (intake_item_id);

alter table public.finance_processing_events
  drop constraint finance_processing_events_intake_item_id_fkey,
  add constraint finance_processing_events_intake_item_id_fkey
    foreign key (intake_item_id, user_id)
    references public.finance_intake_items (id, user_id)
    on delete cascade;

alter table public.finance_rule_suggestions
  drop constraint finance_rule_suggestions_category_id_fkey,
  add constraint finance_rule_suggestions_category_id_fkey
    foreign key (category_id, user_id)
    references public.finance_categories (id, user_id)
    on delete no action deferrable initially deferred,
  add constraint finance_rule_suggestions_source_id_fkey
    foreign key (source_id, user_id)
    references public.finance_sources (id, user_id)
    on delete no action deferrable initially deferred;

-- Cover all final child-side foreign keys. Advisor-reported existing indexes are
-- retained, including those currently reported unused.
create index finance_candidate_transactions_user_id_idx
  on public.finance_candidate_transactions (user_id);

create index finance_candidate_transactions_intake_user_idx
  on public.finance_candidate_transactions (intake_item_id, user_id);

create index finance_candidate_transactions_matched_rule_user_idx
  on public.finance_candidate_transactions (matched_rule_id, user_id);

create index finance_candidate_transactions_confirmed_tx_intake_user_idx
  on public.finance_candidate_transactions (confirmed_transaction_id, intake_item_id, user_id);

create index finance_corrections_intake_user_idx
  on public.finance_corrections (intake_item_id, user_id);

create index finance_corrections_transaction_user_idx
  on public.finance_corrections (transaction_id, user_id);

create index finance_processing_events_intake_user_idx
  on public.finance_processing_events (intake_item_id, user_id);

create index finance_processing_events_user_id_idx
  on public.finance_processing_events (user_id);

create index finance_rule_suggestions_category_user_idx
  on public.finance_rule_suggestions (category_id, user_id);

create index finance_rule_suggestions_source_user_idx
  on public.finance_rule_suggestions (source_id, user_id);

create index finance_rules_category_user_idx
  on public.finance_rules (category_id, user_id);

create index finance_rules_source_user_idx
  on public.finance_rules (source_id, user_id);

create index finance_rules_user_id_idx
  on public.finance_rules (user_id);

create index finance_transactions_category_user_idx
  on public.finance_transactions (category_id, user_id);

create index finance_transactions_source_user_idx
  on public.finance_transactions (source_id, user_id);

create index finance_transactions_intake_user_idx
  on public.finance_transactions (intake_item_id, user_id);

create unique index finance_rules_auto_learning_key_idx
  on public.finance_rules (
    user_id,
    lower(regexp_replace(btrim(pattern), '[[:space:]]+', ' ', 'g')),
    category_id,
    direction,
    source_id
  )
  where auto_created_at is not null;

-- Keep merchant comparison identical in the application and database: NFKC,
-- lowercase cased letters, ASCII digits, and no punctuation or uncased script.
create function public.finance_normalize_merchant_key(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(
    string_agg(lower(character), '' order by ordinal)
      filter (
        where character between '0' and '9'
           or lower(character) <> upper(character)
      ),
    ''
  )
  from regexp_split_to_table(
    normalize(coalesce(p_value, ''), NFKC),
    ''
  ) with ordinality as characters(character, ordinal);
$function$;

-- Exact-image uniqueness remains durable, while a failed attempt can be
-- retried by resetting the same intake row and retaining its event history.
create function public.finance_begin_screenshot_intake(
  p_user_id uuid,
  p_image_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  intake_row public.finance_intake_items%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Finance user is required';
  end if;
  if p_image_hash is null or p_image_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Finance image hash is invalid';
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
      image_hash
    ) values (
      p_user_id,
      'screenshot',
      'processing',
      p_image_hash
    )
    returning * into intake_row;

    return jsonb_build_object(
      'started', true,
      'retried', false,
      'intake', to_jsonb(intake_row)
    );
  end if;

  if intake_row.status <> 'failed' then
    return jsonb_build_object(
      'started', false,
      'retried', false,
      'reason', 'already_processed',
      'intake', to_jsonb(intake_row)
    );
  end if;

  if exists (
       select 1
       from public.finance_candidate_transactions
       where user_id = p_user_id
         and intake_item_id = intake_row.id
     )
     or exists (
       select 1
       from public.finance_transactions
       where user_id = p_user_id
         and intake_item_id = intake_row.id
     ) then
    return jsonb_build_object(
      'started', false,
      'retried', false,
      'reason', 'failed_intake_has_lineage',
      'intake', to_jsonb(intake_row)
    );
  end if;

  update public.finance_intake_items
  set status = 'processing',
      ocr_text = null,
      ocr_raw_text = null,
      ocr_normalized_text = null,
      ocr_confidence = null,
      ocr_text_hash = null,
      normalizer_version = null,
      received_at = now(),
      processed_at = null,
      error_message = null,
      updated_at = now()
  where id = intake_row.id
    and user_id = p_user_id
  returning * into intake_row;

  insert into public.finance_processing_events (
    user_id,
    intake_item_id,
    event_type,
    detail
  ) values (
    p_user_id,
    intake_row.id,
    'retry_started',
    jsonb_build_object('reason', 'previous_processing_failed')
  );

  return jsonb_build_object(
    'started', true,
    'retried', true,
    'intake', to_jsonb(intake_row)
  );
end;
$function$;

-- Every confirmed-ledger mutation participates in the same per-user
-- transaction lock. Trusted RPCs acquire it before row locks. A direct
-- UPDATE/DELETE already holds its target row when this trigger runs, so it uses
-- a fail-fast advisory attempt and returns a retryable serialization error
-- instead of waiting in a lock inversion. INSERT has no prior ledger row and
-- may safely wait for the advisory lock.
create function public.finance_lock_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  target_user_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '23514', message = 'Finance transaction ownership cannot change';
    end if;
  end if;
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'idea-dump:finance-ledger:' || target_user_id::text,
        0
      )
    );
  elsif not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-ledger:' || target_user_id::text,
      0
    )
  ) then
    raise exception using
      errcode = '40001',
      message = 'Finance ledger is busy; retry the operation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger finance_transactions_lock_ledger_mutation
before insert or update or delete
on public.finance_transactions
for each row
execute function public.finance_lock_ledger_mutation();

-- One atomic, idempotent transition owns transaction creation, corrections,
-- candidate/intake state, and processing events.
create function public.finance_confirm_candidate(
  p_user_id uuid,
  p_candidate_id uuid,
  p_source_id uuid,
  p_category_id uuid,
  p_direction text,
  p_amount numeric,
  p_merchant text,
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
  candidate_row public.finance_candidate_transactions%rowtype;
  intake_row public.finance_intake_items%rowtype;
  transaction_row public.finance_transactions%rowtype;
  latest_duplicate_transaction_id uuid;
  latest_duplicate_outcome text := 'none';
  latest_duplicate_score numeric(5,2) := 0;
  latest_duplicate_signals text[] := '{}'::text[];
  latest_duplicate_explanation text := 'No deterministic duplicate signals matched.';
  latest_duplicate_transaction_date date;
  current_ocr_text_hash text;
  current_merchant_key text;
  override_permitted boolean := false;
  correction record;
begin
  if p_confirmation_mode is null
     or p_confirmation_mode not in ('manual', 'automatic') then
    raise exception using errcode = '22023', message = 'Invalid Finance confirmation mode';
  end if;

  if p_direction is null
     or p_direction not in ('expense', 'income') then
    raise exception using errcode = '22023', message = 'Invalid Finance transaction direction';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'Finance amount must be a positive value with at most two decimals';
  end if;

  if p_transaction_date is null then
    raise exception using errcode = '22023', message = 'Finance transaction date is required';
  end if;

  if p_currency is distinct from 'MYR' then
    raise exception using errcode = '22023', message = 'Finance v1 supports MYR only';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-ledger:' || p_user_id::text,
      0
    )
  );

  -- Every candidate transition locks candidate first, then intake.
  select * into candidate_row
  from public.finance_candidate_transactions
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance candidate not found';
  end if;

  select * into intake_row
  from public.finance_intake_items
  where id = candidate_row.intake_item_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Finance candidate intake is invalid';
  end if;

  if candidate_row.status = 'accepted' then
    if candidate_row.confirmed_transaction_id is null then
      raise exception using errcode = '23514', message = 'Accepted Finance candidate has no confirmed transaction';
    end if;

    select * into transaction_row
    from public.finance_transactions
    where id = candidate_row.confirmed_transaction_id
      and intake_item_id = candidate_row.intake_item_id
      and user_id = p_user_id;

    if not found then
      raise exception using errcode = '23514', message = 'Confirmed Finance transaction link is invalid';
    end if;

    return jsonb_build_object(
      'confirmed', true,
      'transaction', to_jsonb(transaction_row),
      'candidate', to_jsonb(candidate_row),
      'intake', to_jsonb(intake_row)
    );
  end if;

  if candidate_row.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Finance candidate cannot be confirmed from its current state';
  end if;

  if intake_row.status not in ('processing', 'review') then
    raise exception using errcode = '23514', message = 'Finance intake cannot be confirmed from its current state';
  end if;

  if p_confirmation_mode = 'automatic' then
    if candidate_row.confidence is null or candidate_row.confidence < 0.90 then
      raise exception using errcode = '23514', message = 'Automatic Finance confirmation requires confidence of at least 0.90';
    end if;

    if p_category_id is null or candidate_row.matched_rule_id is null then
      raise exception using errcode = '23514', message = 'Automatic Finance confirmation requires a category and a strong rule';
    end if;

    perform 1
    from public.finance_rules
    where id = candidate_row.matched_rule_id
      and user_id = p_user_id
      and is_active = true
      and match_type in ('exact_phrase', 'merchant_alias')
      and category_id = p_category_id
      and (source_id is null or source_id = p_source_id)
      and (direction is null or direction = p_direction)
    for share;
    if not found then
      raise exception using errcode = '23514', message = 'Automatic Finance confirmation requires an active strong rule';
    end if;
  end if;

  select * into transaction_row
  from public.finance_transactions
  where intake_item_id = candidate_row.intake_item_id
    and user_id = p_user_id;

  if found then
    raise exception using errcode = '23505', message = 'Finance intake already has a transaction';
  end if;

  perform 1
  from public.finance_sources
  where id = p_source_id
    and user_id = p_user_id
    and is_archived = false;
  if not found then
    raise exception using errcode = '23503', message = 'Active Finance source not found';
  end if;

  if p_category_id is not null then
    perform 1
    from public.finance_categories
    where id = p_category_id
      and user_id = p_user_id
      and is_archived = false
      and type = p_direction;
    if not found then
      raise exception using errcode = '23503', message = 'Compatible active Finance category not found';
    end if;
  end if;

  -- The application assessment is advisory. Under the per-user ledger lock,
  -- recompute the best match from committed rows using the final edited values.
  current_ocr_text_hash := intake_row.ocr_text_hash;
  current_merchant_key := public.finance_normalize_merchant_key(p_merchant);

  select
    assessed.id,
    assessed.outcome,
    assessed.score,
    assessed.signals,
    assessed.transaction_date
  into
    latest_duplicate_transaction_id,
    latest_duplicate_outcome,
    latest_duplicate_score,
    latest_duplicate_signals,
    latest_duplicate_transaction_date
  from (
    select
      transactions.id,
      transactions.transaction_date,
      case
        when matches.reference_matches then 'strong'
        when matches.ocr_text_matches then 'strong'
        when matches.amount_matches
          and matches.date_matches
          and matches.source_matches
          and matches.merchant_matches then 'strong'
        when matches.amount_matches
          and matches.date_matches
          and matches.merchant_matches then 'possible'
        when matches.amount_matches
          and matches.merchant_matches
          and abs(transactions.transaction_date - p_transaction_date) <= 1 then 'possible'
        when matches.amount_matches and matches.date_matches then 'possible'
        else 'none'
      end as outcome,
      case
        when matches.reference_matches then 100::numeric
        when matches.ocr_text_matches then 95::numeric
        when matches.amount_matches
          and matches.date_matches
          and matches.source_matches
          and matches.merchant_matches then 90::numeric
        when matches.amount_matches
          and matches.date_matches
          and matches.merchant_matches then 70::numeric
        when matches.amount_matches
          and matches.merchant_matches
          and abs(transactions.transaction_date - p_transaction_date) <= 1 then 60::numeric
        when matches.amount_matches and matches.date_matches then 40::numeric
        else 0::numeric
      end as score,
      case
        when matches.reference_matches then array['reference_number', 'source']::text[]
        when matches.ocr_text_matches then array['ocr_text_hash']::text[]
        when matches.amount_matches
          and matches.date_matches
          and matches.source_matches
          and matches.merchant_matches
          then array['amount', 'transaction_date', 'source', 'merchant']::text[]
        when matches.amount_matches
          and matches.date_matches
          and matches.merchant_matches
          then array['amount', 'transaction_date', 'merchant']::text[]
        when matches.amount_matches
          and matches.merchant_matches
          and abs(transactions.transaction_date - p_transaction_date) <= 1
          then array['amount', 'merchant']::text[]
        when matches.amount_matches and matches.date_matches
          then array['amount', 'transaction_date']::text[]
        else '{}'::text[]
      end as signals
    from public.finance_transactions transactions
    left join public.finance_intake_items existing_intakes
      on existing_intakes.id = transactions.intake_item_id
     and existing_intakes.user_id = transactions.user_id
    cross join lateral (
      select
        transactions.amount = p_amount as amount_matches,
        transactions.transaction_date = p_transaction_date as date_matches,
        transactions.source_id = p_source_id as source_matches,
        current_merchant_key <> ''
          and public.finance_normalize_merchant_key(transactions.merchant) = current_merchant_key
          as merchant_matches,
        public.finance_normalize_reference_number(p_reference_number) is not null
        and transactions.source_id = p_source_id
          and transactions.reference_number = public.finance_normalize_reference_number(p_reference_number)
          as reference_matches,
        current_ocr_text_hash is not null
          and existing_intakes.ocr_text_hash = current_ocr_text_hash
          as ocr_text_matches
    ) matches
    where transactions.user_id = p_user_id
      and transactions.status = 'confirmed'
      and transactions.currency = p_currency
      and transactions.intake_item_id is distinct from candidate_row.intake_item_id
      and (
        (
          transactions.amount = p_amount
          and transactions.transaction_date between p_transaction_date - 1 and p_transaction_date + 1
        )
        or (
          public.finance_normalize_reference_number(p_reference_number) is not null
          and transactions.source_id = p_source_id
          and transactions.reference_number = public.finance_normalize_reference_number(p_reference_number)
        )
        or (
          current_ocr_text_hash is not null
          and existing_intakes.ocr_text_hash = current_ocr_text_hash
        )
      )
  ) assessed
  where assessed.score > 0
  order by assessed.score desc, assessed.transaction_date desc, assessed.id
  limit 1;

  if not found then
    latest_duplicate_transaction_id := null;
    latest_duplicate_outcome := 'none';
    latest_duplicate_score := 0;
    latest_duplicate_signals := '{}'::text[];
    latest_duplicate_explanation := 'No deterministic duplicate signals matched.';
  else
    latest_duplicate_explanation := case latest_duplicate_score
      when 100 then 'Matched on same reference number and source.'
      when 95 then 'Matched on same normalized OCR text.'
      when 90 then 'Matched on same amount, transaction date, source, and merchant.'
      when 70 then 'Matched on same amount, transaction date, and merchant.'
      when 60 then 'Matched on same amount and merchant within one day.'
      else 'Matched on same amount and transaction date.'
    end;
  end if;

  update public.finance_candidate_transactions
  set payload = case
        when latest_duplicate_transaction_id is null then payload - 'duplicate_transaction_id'
        else jsonb_set(
          coalesce(payload, '{}'::jsonb),
          '{duplicate_transaction_id}',
          to_jsonb(latest_duplicate_transaction_id::text),
          true
        )
      end,
      duplicate_outcome = latest_duplicate_outcome,
      duplicate_score = latest_duplicate_score,
      duplicate_signals = latest_duplicate_signals,
      duplicate_explanation = latest_duplicate_explanation,
      duplicate_checked_at = now(),
      updated_at = now()
  where id = candidate_row.id
  returning * into candidate_row;

  insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
  values (
    p_user_id,
    intake_row.id,
    'duplicate_rechecked',
    jsonb_build_object(
      'candidate_id', candidate_row.id,
      'outcome', latest_duplicate_outcome,
      'score', latest_duplicate_score,
      'matched_transaction_id', latest_duplicate_transaction_id,
      'signals', to_jsonb(latest_duplicate_signals)
    )
  );

  override_permitted := latest_duplicate_outcome <> 'none'
    and p_confirmation_mode = 'manual'
    and coalesce(p_allow_duplicate, false)
    and (
      latest_duplicate_outcome <> 'strong'
      or nullif(btrim(p_duplicate_override_reason), '') is not null
    );

  if latest_duplicate_outcome <> 'none' and not override_permitted then
    update public.finance_intake_items
    set status = 'review',
        processed_at = coalesce(processed_at, now()),
        updated_at = now()
    where id = intake_row.id
    returning * into intake_row;

    insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
    values (
      p_user_id,
      intake_row.id,
      'duplicate_review_required',
      jsonb_build_object(
        'candidate_id', candidate_row.id,
        'matched_transaction_id', latest_duplicate_transaction_id,
        'outcome', latest_duplicate_outcome
      )
    );

    return jsonb_build_object(
      'confirmed', false,
      'reason', case
        when p_confirmation_mode = 'automatic' then 'duplicate_review_required'
        when latest_duplicate_outcome = 'strong'
          and nullif(btrim(p_duplicate_override_reason), '') is null
          then 'strong_duplicate_reason_required'
        else 'duplicate_override_required'
      end,
      'candidate', to_jsonb(candidate_row),
      'intake', to_jsonb(intake_row),
      'duplicate', jsonb_build_object(
        'outcome', latest_duplicate_outcome,
        'score', latest_duplicate_score,
        'signals', to_jsonb(latest_duplicate_signals),
        'explanation', latest_duplicate_explanation,
        'matched_transaction_id', latest_duplicate_transaction_id,
        'matched_transaction_date', latest_duplicate_transaction_date
      )
    );
  end if;

  insert into public.finance_transactions (
    user_id,
    source_id,
    category_id,
    intake_item_id,
    direction,
    amount,
    merchant,
    transaction_date,
    notes,
    source,
    status,
    currency,
    reference_number
  ) values (
    p_user_id,
    p_source_id,
    p_category_id,
    candidate_row.intake_item_id,
    p_direction,
    p_amount,
    nullif(btrim(p_merchant), ''),
    p_transaction_date,
    nullif(btrim(p_notes), ''),
    'screenshot',
    'confirmed',
    p_currency,
    public.finance_normalize_reference_number(p_reference_number)
  )
  returning * into transaction_row;

  for correction in
    select field_name, previous_value, corrected_value
    from (values
      ('source_id'::text, candidate_row.payload -> 'source_id', to_jsonb(p_source_id::text)),
      ('category_id'::text, candidate_row.payload -> 'category_id', to_jsonb(p_category_id::text)),
      ('direction'::text, candidate_row.payload -> 'direction', to_jsonb(p_direction)),
      ('amount'::text, candidate_row.payload -> 'amount', to_jsonb(p_amount)),
      ('merchant'::text, candidate_row.payload -> 'merchant', to_jsonb(nullif(btrim(p_merchant), ''))),
      ('transaction_date'::text, candidate_row.payload -> 'transaction_date', to_jsonb(p_transaction_date::text)),
      ('currency'::text, candidate_row.payload -> 'currency', to_jsonb(p_currency)),
      (
        'reference_number'::text,
        coalesce(candidate_row.payload -> 'reference_number', candidate_row.payload -> 'reference'),
        to_jsonb(public.finance_normalize_reference_number(p_reference_number))
      )
    ) as changes(field_name, previous_value, corrected_value)
    where coalesce(previous_value, 'null'::jsonb)
          is distinct from coalesce(corrected_value, 'null'::jsonb)
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
      candidate_row.intake_item_id,
      correction.field_name,
      correction.previous_value,
      correction.corrected_value,
      left(coalesce(intake_row.ocr_normalized_text, intake_row.ocr_text), 1000)
    );
  end loop;

  update public.finance_candidate_transactions
  set status = 'accepted',
      confirmed_transaction_id = transaction_row.id,
      updated_at = now()
  where id = candidate_row.id
  returning * into candidate_row;

  update public.finance_intake_items
  set status = 'completed',
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
  where id = intake_row.id
  returning * into intake_row;

  insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
  values (
    p_user_id,
    intake_row.id,
    'confirmation_completed',
    jsonb_build_object(
      'candidate_id', candidate_row.id,
      'transaction_id', transaction_row.id,
      'mode', p_confirmation_mode,
      'candidate_confidence', candidate_row.confidence
    )
  );

  if candidate_row.duplicate_outcome <> 'none' then
    insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
    values (
      p_user_id,
      intake_row.id,
      'duplicate_overridden',
      jsonb_strip_nulls(jsonb_build_object(
        'candidate_id', candidate_row.id,
        'transaction_id', transaction_row.id,
        'matched_transaction_id', latest_duplicate_transaction_id,
        'outcome', candidate_row.duplicate_outcome,
        'signals', to_jsonb(candidate_row.duplicate_signals),
        'reason', nullif(btrim(p_duplicate_override_reason), '')
      ))
    );
  end if;

  return jsonb_build_object(
    'confirmed', true,
    'transaction', to_jsonb(transaction_row),
    'candidate', to_jsonb(candidate_row),
    'intake', to_jsonb(intake_row)
  );
end;
$function$;

-- Explicit duplicate resolution updates candidate, intake, and audit event in
-- one transaction and never creates a ledger row.
create function public.finance_mark_candidate_duplicate(
  p_user_id uuid,
  p_candidate_id uuid,
  p_matched_transaction_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  candidate_row public.finance_candidate_transactions%rowtype;
  intake_row public.finance_intake_items%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-ledger:' || p_user_id::text,
      0
    )
  );

  select * into candidate_row
  from public.finance_candidate_transactions
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance candidate not found';
  end if;

  select * into intake_row
  from public.finance_intake_items
  where id = candidate_row.intake_item_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Finance candidate intake is invalid';
  end if;

  if candidate_row.status = 'duplicate'
     and nullif(candidate_row.payload ->> 'duplicate_transaction_id', '')::uuid = p_matched_transaction_id then
    return true;
  end if;

  if candidate_row.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Finance candidate cannot be marked duplicate from its current state';
  end if;

  perform 1
  from public.finance_transactions
  where id = p_matched_transaction_id
    and user_id = p_user_id
    and status = 'confirmed';
  if not found then
    raise exception using errcode = '23503', message = 'Matched Finance transaction not found';
  end if;

  update public.finance_candidate_transactions
  set status = 'duplicate',
      payload = jsonb_set(
        coalesce(payload, '{}'::jsonb),
        '{duplicate_transaction_id}',
        to_jsonb(p_matched_transaction_id::text),
        true
      ),
      duplicate_outcome = case when duplicate_outcome = 'none' then 'strong' else duplicate_outcome end,
      duplicate_checked_at = coalesce(duplicate_checked_at, now()),
      updated_at = now()
  where id = candidate_row.id;

  update public.finance_intake_items
  set status = 'duplicate',
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
  where id = intake_row.id;

  insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
  values (
    p_user_id,
    intake_row.id,
    'duplicate_marked',
    jsonb_build_object(
      'candidate_id', candidate_row.id,
      'matched_transaction_id', p_matched_transaction_id
    )
  );

  return true;
end;
$function$;

-- Rejecting a review item is also one state transition so candidate, intake,
-- and audit history cannot diverge under retries or concurrent confirmation.
create function public.finance_reject_candidate(
  p_user_id uuid,
  p_candidate_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  candidate_row public.finance_candidate_transactions%rowtype;
  intake_row public.finance_intake_items%rowtype;
begin
  select * into candidate_row
  from public.finance_candidate_transactions
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance candidate not found';
  end if;

  select * into intake_row
  from public.finance_intake_items
  where id = candidate_row.intake_item_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Finance candidate intake is invalid';
  end if;

  if candidate_row.status = 'rejected' then
    update public.finance_intake_items
    set status = 'rejected',
        processed_at = coalesce(processed_at, now()),
        updated_at = now()
    where id = intake_row.id
      and status <> 'rejected';
    return true;
  end if;

  if candidate_row.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Finance candidate cannot be rejected from its current state';
  end if;

  update public.finance_candidate_transactions
  set status = 'rejected',
      updated_at = now()
  where id = candidate_row.id;

  update public.finance_intake_items
  set status = 'rejected',
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
  where id = intake_row.id;

  insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
  values (
    p_user_id,
    intake_row.id,
    'review_rejected',
    jsonb_build_object('candidate_id', candidate_row.id)
  );

  return true;
end;
$function$;

-- Ledger edits and their correction evidence commit together. The same ledger
-- advisory lock keeps edits ordered with screenshot confirmations and deletes.
create function public.finance_update_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_source_id uuid,
  p_category_id uuid,
  p_direction text,
  p_amount numeric,
  p_merchant text,
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
  transaction_row public.finance_transactions%rowtype;
  updated_row public.finance_transactions%rowtype;
  correction record;
  context_text text;
begin
  if p_direction is null or p_direction not in ('expense', 'income') then
    raise exception using errcode = '22023', message = 'Invalid Finance transaction direction';
  end if;
  if p_amount is null
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'Finance amount must be a positive value with at most two decimals';
  end if;
  if p_transaction_date is null then
    raise exception using errcode = '22023', message = 'Finance transaction date is required';
  end if;
  if p_currency is distinct from 'MYR' then
    raise exception using errcode = '22023', message = 'Finance v1 supports MYR only';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-ledger:' || p_user_id::text,
      0
    )
  );

  select * into transaction_row
  from public.finance_transactions
  where id = p_transaction_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance transaction not found';
  end if;

  if transaction_row.status <> 'confirmed' then
    raise exception using errcode = '23514', message = 'Only confirmed Finance transactions can be edited';
  end if;

  perform 1
  from public.finance_sources
  where id = p_source_id
    and user_id = p_user_id
    and (is_archived = false or id = transaction_row.source_id)
  for share;
  if not found then
    raise exception using errcode = '23503', message = 'Compatible Finance source not found';
  end if;

  if p_category_id is not null then
    perform 1
    from public.finance_categories
    where id = p_category_id
      and user_id = p_user_id
      and type = p_direction
      and (is_archived = false or id = transaction_row.category_id)
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Compatible Finance category not found';
    end if;
  end if;

  if transaction_row.intake_item_id is not null then
    select left(coalesce(ocr_normalized_text, ocr_text), 1000)
    into context_text
    from public.finance_intake_items
    where id = transaction_row.intake_item_id
      and user_id = p_user_id;
  end if;

  update public.finance_transactions
  set source_id = p_source_id,
      category_id = p_category_id,
      direction = p_direction,
      amount = p_amount,
      merchant = nullif(btrim(p_merchant), ''),
      transaction_date = p_transaction_date,
      notes = nullif(btrim(p_notes), ''),
      currency = p_currency,
      reference_number = public.finance_normalize_reference_number(p_reference_number),
      updated_at = now()
  where id = transaction_row.id
    and user_id = p_user_id
  returning * into updated_row;

  for correction in
    select field_name, previous_value, corrected_value
    from (values
      ('source_id'::text, to_jsonb(transaction_row.source_id::text), to_jsonb(updated_row.source_id::text)),
      ('category_id'::text, to_jsonb(transaction_row.category_id::text), to_jsonb(updated_row.category_id::text)),
      ('direction'::text, to_jsonb(transaction_row.direction), to_jsonb(updated_row.direction)),
      ('amount'::text, to_jsonb(transaction_row.amount), to_jsonb(updated_row.amount)),
      ('merchant'::text, to_jsonb(transaction_row.merchant), to_jsonb(updated_row.merchant)),
      ('transaction_date'::text, to_jsonb(transaction_row.transaction_date::text), to_jsonb(updated_row.transaction_date::text)),
      ('notes'::text, to_jsonb(transaction_row.notes), to_jsonb(updated_row.notes)),
      ('currency'::text, to_jsonb(transaction_row.currency), to_jsonb(updated_row.currency)),
      ('reference_number'::text, to_jsonb(transaction_row.reference_number), to_jsonb(updated_row.reference_number))
    ) as changes(field_name, previous_value, corrected_value)
    where coalesce(previous_value, 'null'::jsonb)
          is distinct from coalesce(corrected_value, 'null'::jsonb)
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

-- Deleting a ledger row removes its correction history and, for screenshot
-- transactions, the complete intake/candidate/event lineage so the same image
-- may be deliberately imported again later.
create function public.finance_delete_transaction(
  p_user_id uuid,
  p_transaction_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  transaction_row public.finance_transactions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'idea-dump:finance-ledger:' || p_user_id::text,
      0
    )
  );

  select * into transaction_row
  from public.finance_transactions
  where id = p_transaction_id
    and user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if transaction_row.intake_item_id is not null then
    perform 1
    from public.finance_candidate_transactions
    where intake_item_id = transaction_row.intake_item_id
      and user_id = p_user_id
    for update;

    perform 1
    from public.finance_intake_items
    where id = transaction_row.intake_item_id
      and user_id = p_user_id
    for update;
  end if;

  perform 1
  from public.finance_candidate_transactions
  where user_id = p_user_id
    and nullif(payload ->> 'duplicate_transaction_id', '')::uuid = transaction_row.id
  order by id
  for update;

  with affected as materialized (
    select id, intake_item_id, status
    from public.finance_candidate_transactions
    where user_id = p_user_id
      and nullif(payload ->> 'duplicate_transaction_id', '')::uuid = transaction_row.id
  ), updated_candidates as (
    update public.finance_candidate_transactions candidates
    set status = case when candidates.status = 'duplicate' then 'pending' else candidates.status end,
        payload = candidates.payload - 'duplicate_transaction_id',
        duplicate_outcome = 'none',
        duplicate_score = 0,
        duplicate_signals = '{}'::text[],
        duplicate_explanation = 'Referenced transaction was deleted; duplicate check must run again.',
        duplicate_checked_at = now(),
        updated_at = now()
    from affected
    where candidates.id = affected.id
    returning candidates.id, candidates.intake_item_id, affected.status as previous_status
  ), updated_intakes as (
    update public.finance_intake_items intakes
    set status = 'review',
        updated_at = now()
    from updated_candidates
    where intakes.id = updated_candidates.intake_item_id
      and intakes.user_id = p_user_id
      and updated_candidates.previous_status = 'duplicate'
    returning intakes.id
  )
  insert into public.finance_processing_events (user_id, intake_item_id, event_type, detail)
  select
    p_user_id,
    updated_candidates.intake_item_id,
    'duplicate_reference_removed',
    jsonb_build_object(
      'candidate_id', updated_candidates.id,
      'deleted_transaction_id', transaction_row.id,
      'previous_status', updated_candidates.previous_status
    )
  from updated_candidates;

  delete from public.finance_corrections
  where user_id = p_user_id
    and (
      transaction_id = transaction_row.id
      or (
        transaction_row.intake_item_id is not null
        and intake_item_id = transaction_row.intake_item_id
      )
    );

  delete from public.finance_transactions
  where id = transaction_row.id
    and user_id = p_user_id;

  if transaction_row.intake_item_id is not null then
    delete from public.finance_intake_items
    where id = transaction_row.intake_item_id
      and user_id = p_user_id;
  end if;

  return true;
end;
$function$;

-- Accept the persisted, user-edited suggestion and create its rule atomically.
create function public.finance_accept_rule_suggestion(
  p_user_id uuid,
  p_suggestion_id uuid
)
returns public.finance_rules
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  suggestion_row public.finance_rule_suggestions%rowtype;
  rule_row public.finance_rules%rowtype;
begin
  select * into suggestion_row
  from public.finance_rule_suggestions
  where id = p_suggestion_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finance rule suggestion not found';
  end if;

  if suggestion_row.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Finance rule suggestion is already resolved';
  end if;

  if nullif(btrim(suggestion_row.name), '') is null
     or nullif(btrim(suggestion_row.pattern), '') is null then
    raise exception using errcode = '22023', message = 'Finance rule name and pattern are required';
  end if;

  perform 1
  from public.finance_categories
  where id = suggestion_row.category_id
    and user_id = p_user_id
    and type = suggestion_row.direction
    and is_archived = false;
  if not found then
    raise exception using errcode = '23503', message = 'Compatible active Finance category not found';
  end if;

  if suggestion_row.source_id is not null then
    perform 1
    from public.finance_sources
    where id = suggestion_row.source_id
      and user_id = p_user_id
      and is_archived = false;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance source not found';
    end if;
  end if;

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
    learning_evidence_count
  ) values (
    p_user_id,
    btrim(suggestion_row.name),
    suggestion_row.match_type,
    btrim(suggestion_row.pattern),
    suggestion_row.category_id,
    suggestion_row.direction,
    suggestion_row.priority,
    true,
    'learning',
    suggestion_row.source_id,
    suggestion_row.evidence_count
  )
  returning * into rule_row;

  update public.finance_rule_suggestions
  set status = 'accepted',
      updated_at = now()
  where id = suggestion_row.id;

  return rule_row;
end;
$function$;

-- JSON references participate in the same row-lock protocol as relational
-- foreign keys. Dimension locks prevent deletion/type-change races. A changed
-- duplicate target uses the ledger advisory lock; because this row is already
-- locked, contention fails with 40001 instead of waiting in an inverted order.
create function public.finance_validate_candidate_payload_dimensions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  candidate_source_text text := nullif(new.payload ->> 'source_id', '');
  candidate_source_id uuid;
  candidate_category_text text := nullif(new.payload ->> 'category_id', '');
  candidate_category_id uuid;
  candidate_direction text := nullif(new.payload ->> 'direction', '');
  candidate_duplicate_text text := nullif(new.payload ->> 'duplicate_transaction_id', '');
  candidate_duplicate_id uuid;
  duplicate_changed boolean;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception using errcode = '23514', message = 'Finance candidate ownership cannot change';
  end if;

  if tg_op = 'INSERT' then
    duplicate_changed := candidate_duplicate_text is not null;
  else
    duplicate_changed := candidate_duplicate_text is distinct from
      nullif(old.payload ->> 'duplicate_transaction_id', '');
  end if;

  if duplicate_changed then
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'idea-dump:finance-ledger:' || new.user_id::text,
        0
      )
    ) then
      raise exception using
        errcode = '40001',
        message = 'Finance ledger is busy; retry the candidate update';
    end if;

    if candidate_duplicate_text is not null then
      begin
        candidate_duplicate_id := candidate_duplicate_text::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Invalid Finance duplicate transaction ID';
      end;

      perform 1
      from public.finance_transactions
      where id = candidate_duplicate_id
        and user_id = new.user_id
        and status = 'confirmed'
      for share;
      if not found then
        raise exception using errcode = '23503', message = 'Finance duplicate transaction not found';
      end if;

      new.payload := jsonb_set(
        new.payload,
        '{duplicate_transaction_id}',
        to_jsonb(candidate_duplicate_id::text),
        true
      );
    end if;
  end if;

  if candidate_direction is not null
     and candidate_direction not in ('expense', 'income') then
    raise exception using errcode = '22023', message = 'Invalid Finance candidate direction';
  end if;

  if candidate_category_text is not null then
    begin
      candidate_category_id := candidate_category_text::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid Finance candidate category ID';
    end;

    perform 1
    from public.finance_categories
    where id = candidate_category_id
      and user_id = new.user_id
      and (candidate_direction is null or type = candidate_direction)
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Compatible Finance candidate category not found';
    end if;
    new.payload := jsonb_set(new.payload, '{category_id}', to_jsonb(candidate_category_id::text), true);
  end if;

  if candidate_source_text is not null then
    begin
      candidate_source_id := candidate_source_text::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid Finance candidate source ID';
    end;

    perform 1
    from public.finance_sources
    where id = candidate_source_id
      and user_id = new.user_id
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Finance candidate source not found';
    end if;
    new.payload := jsonb_set(new.payload, '{source_id}', to_jsonb(candidate_source_id::text), true);
  end if;

  return new;
end;
$function$;

create trigger finance_candidate_transactions_validate_payload_dimensions
before insert or update of payload, user_id
on public.finance_candidate_transactions
for each row
execute function public.finance_validate_candidate_payload_dimensions();

-- Corrections intentionally retain historical source/category IDs. Lock and
-- validate those JSON scalar references so permanent deletion cannot pass its
-- unreferenced check while new evidence is being committed.
create function public.finance_validate_correction_dimension_references()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  reference_text text;
  reference_id uuid;
begin
  if new.field_name not in ('source_id', 'category_id') then
    return new;
  end if;

  for reference_text in
    select distinct values_to_check.value_text
    from (
      values
        (new.previous_value #>> '{}'),
        (new.corrected_value #>> '{}')
    ) as values_to_check(value_text)
    where values_to_check.value_text is not null
    order by values_to_check.value_text
  loop
    begin
      reference_id := reference_text::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid Finance correction dimension ID';
    end;

    if new.field_name = 'source_id' then
      perform 1
      from public.finance_sources
      where id = reference_id
        and user_id = new.user_id
      for share;
      if not found then
        raise exception using errcode = '23503', message = 'Finance correction source not found';
      end if;
    else
      perform 1
      from public.finance_categories
      where id = reference_id
        and user_id = new.user_id
      for share;
      if not found then
        raise exception using errcode = '23503', message = 'Finance correction category not found';
      end if;
    end if;
  end loop;

  return new;
end;
$function$;

create trigger finance_corrections_validate_dimension_references
before insert or update of user_id, field_name, previous_value, corrected_value
on public.finance_corrections
for each row
execute function public.finance_validate_correction_dimension_references();

-- Permanent deletion is available only when every relational and JSON payload
-- reference is absent. The application separately requires explicit user
-- confirmation before invoking these helpers.
create function public.finance_delete_source(
  p_user_id uuid,
  p_source_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform 1
  from public.finance_sources
  where id = p_source_id
    and user_id = p_user_id
  for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from public.finance_transactions where user_id = p_user_id and source_id = p_source_id)
     or exists (select 1 from public.finance_rules where user_id = p_user_id and source_id = p_source_id)
     or exists (select 1 from public.finance_rule_suggestions where user_id = p_user_id and source_id = p_source_id)
     or exists (
       select 1 from public.finance_candidate_transactions
       where user_id = p_user_id
         and nullif(payload ->> 'source_id', '')::uuid = p_source_id
     )
     or exists (
       select 1 from public.finance_corrections
       where user_id = p_user_id
         and field_name = 'source_id'
         and (
           nullif(previous_value #>> '{}', '')::uuid = p_source_id
           or nullif(corrected_value #>> '{}', '')::uuid = p_source_id
         )
     ) then
    raise exception using errcode = '23503', message = 'Finance source is still referenced';
  end if;

  delete from public.finance_sources
  where id = p_source_id
    and user_id = p_user_id;

  return true;
end;
$function$;

create function public.finance_delete_category(
  p_user_id uuid,
  p_category_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform 1
  from public.finance_categories
  where id = p_category_id
    and user_id = p_user_id
  for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from public.finance_transactions where user_id = p_user_id and category_id = p_category_id)
     or exists (select 1 from public.finance_rules where user_id = p_user_id and category_id = p_category_id)
     or exists (select 1 from public.finance_rule_suggestions where user_id = p_user_id and category_id = p_category_id)
     or exists (
       select 1 from public.finance_candidate_transactions
       where user_id = p_user_id
         and nullif(payload ->> 'category_id', '')::uuid = p_category_id
     )
     or exists (
       select 1 from public.finance_corrections
       where user_id = p_user_id
         and field_name = 'category_id'
         and (
           nullif(previous_value #>> '{}', '')::uuid = p_category_id
           or nullif(corrected_value #>> '{}', '')::uuid = p_category_id
         )
     ) then
    raise exception using errcode = '23503', message = 'Finance category is still referenced';
  end if;

  delete from public.finance_categories
  where id = p_category_id
    and user_id = p_user_id;

  return true;
end;
$function$;

-- Reference-side validation takes a SHARE lock on the category. Together
-- with the category-side guard below, this serializes stale inserts against a
-- concurrent type change and enforces category/direction compatibility.
create function public.finance_validate_category_direction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.category_id is null or new.direction is null then
    return new;
  end if;

  perform 1
  from public.finance_categories
  where id = new.category_id
    and user_id = new.user_id
    and type = new.direction
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Finance category type must match transaction or rule direction';
  end if;

  return new;
end;
$function$;

create trigger finance_transactions_validate_category_direction
before insert or update of category_id, user_id, direction
on public.finance_transactions
for each row
execute function public.finance_validate_category_direction();

create trigger finance_rules_validate_category_direction
before insert or update of category_id, user_id, direction
on public.finance_rules
for each row
execute function public.finance_validate_category_direction();

create trigger finance_rule_suggestions_validate_category_direction
before insert or update of category_id, user_id, direction
on public.finance_rule_suggestions
for each row
execute function public.finance_validate_category_direction();

-- New transactions must use active dimensions. Existing confirmed rows may
-- retain an archived dimension until the user deliberately selects another.
create function public.finance_validate_transaction_dimensions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  validate_source boolean;
  validate_category boolean;
begin
  if tg_op = 'INSERT' then
    validate_source := true;
    validate_category := new.category_id is not null;
  else
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '23514', message = 'Finance transaction ownership cannot change';
    end if;
    validate_source := new.source_id is distinct from old.source_id;
    validate_category := new.category_id is not null
      and new.category_id is distinct from old.category_id;
  end if;

  if validate_source then
    perform 1
    from public.finance_sources
    where id = new.source_id
      and user_id = new.user_id
      and is_archived = false
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance source not found';
    end if;
  end if;

  if validate_category then
    perform 1
    from public.finance_categories
    where id = new.category_id
      and user_id = new.user_id
      and is_archived = false
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance category not found';
    end if;
  end if;

  return new;
end;
$function$;

create trigger finance_transactions_validate_active_dimensions
before insert or update of source_id, category_id, user_id
on public.finance_transactions
for each row
execute function public.finance_validate_transaction_dimensions();

-- Active rules lock category first and source second, require both to remain
-- active, and therefore cannot race an archive operation.
create function public.finance_validate_active_rule_dimensions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '23514', message = 'Finance rule ownership cannot change';
    end if;
  end if;
  if not new.is_active then
    return new;
  end if;

  if new.category_id is not null then
    perform 1
    from public.finance_categories
    where id = new.category_id
      and user_id = new.user_id
      and is_archived = false
      and (new.direction is null or type = new.direction)
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Compatible active Finance category not found';
    end if;
  end if;

  if new.source_id is not null then
    perform 1
    from public.finance_sources
    where id = new.source_id
      and user_id = new.user_id
      and is_archived = false
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Active Finance source not found';
    end if;
  end if;

  return new;
end;
$function$;

create trigger finance_rules_validate_active_dimensions
before insert or update of category_id, source_id, direction, is_active, user_id
on public.finance_rules
for each row
execute function public.finance_validate_active_rule_dimensions();

-- Raw archive writes are allowed only after every dependent rule is paused.
-- The two RPCs below lock rules before dimensions, pause them atomically, and
-- therefore avoid the rule-row -> dimension-row inversion of an AFTER trigger.
create function public.finance_guard_archived_dimension()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.is_archived and not old.is_archived then
    if tg_table_name = 'finance_categories' then
      if exists (
        select 1
        from public.finance_rules
        where user_id = new.user_id
          and category_id = new.id
          and is_active = true
      ) then
        raise exception using
          errcode = '23514',
          message = 'Active Finance rules must be paused before archiving this category';
      end if;
    elsif tg_table_name = 'finance_sources' then
      if exists (
        select 1
        from public.finance_rules
        where user_id = new.user_id
          and source_id = new.id
          and is_active = true
      ) then
        raise exception using
          errcode = '23514',
          message = 'Active Finance rules must be paused before archiving this source';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create trigger finance_categories_guard_archive
before update of is_archived
on public.finance_categories
for each row
execute function public.finance_guard_archived_dimension();

create trigger finance_sources_guard_archive
before update of is_archived
on public.finance_sources
for each row
execute function public.finance_guard_archived_dimension();

create function public.finance_set_category_archived(
  p_user_id uuid,
  p_category_id uuid,
  p_is_archived boolean
)
returns public.finance_categories
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  category_row public.finance_categories%rowtype;
begin
  if p_is_archived then
    perform 1
    from public.finance_rules
    where user_id = p_user_id
      and category_id = p_category_id
    order by id
    for update;
  end if;

  select * into category_row
  from public.finance_categories
  where id = p_category_id
    and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Finance category not found';
  end if;

  if p_is_archived then
    update public.finance_rules
    set is_active = false,
        updated_at = now()
    where user_id = p_user_id
      and category_id = p_category_id
      and is_active = true;
  end if;

  update public.finance_categories
  set is_archived = p_is_archived,
      updated_at = now()
  where id = category_row.id
    and user_id = p_user_id
  returning * into category_row;

  return category_row;
end;
$function$;

create function public.finance_set_source_archived(
  p_user_id uuid,
  p_source_id uuid,
  p_is_archived boolean
)
returns public.finance_sources
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  source_row public.finance_sources%rowtype;
begin
  if p_is_archived then
    perform 1
    from public.finance_rules
    where user_id = p_user_id
      and source_id = p_source_id
    order by id
    for update;
  end if;

  select * into source_row
  from public.finance_sources
  where id = p_source_id
    and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Finance source not found';
  end if;

  if p_is_archived then
    update public.finance_rules
    set is_active = false,
        updated_at = now()
    where user_id = p_user_id
      and source_id = p_source_id
      and is_active = true;
  end if;

  update public.finance_sources
  set is_archived = p_is_archived,
      updated_at = now()
  where id = source_row.id
    and user_id = p_user_id
  returning * into source_row;

  return source_row;
end;
$function$;

update public.finance_rules rules
set is_active = false,
    updated_at = now()
where rules.is_active = true
  and (
    exists (
      select 1
      from public.finance_categories categories
      where categories.id = rules.category_id
        and categories.user_id = rules.user_id
        and categories.is_archived = true
    )
    or exists (
      select 1
      from public.finance_sources sources
      where sources.id = rules.source_id
        and sources.user_id = rules.user_id
        and sources.is_archived = true
    )
  );

-- A category's type is editable only while the category is entirely
-- unreferenced. The reference-side SHARE locks above and this row-update
-- guard close both orderings of the application's check-then-update race.
create function public.finance_guard_category_type_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.type is not distinct from old.type then
    return new;
  end if;

  if exists (
       select 1 from public.finance_transactions
       where user_id = old.user_id and category_id = old.id
     )
     or exists (
       select 1 from public.finance_rules
       where user_id = old.user_id and category_id = old.id
     )
     or exists (
       select 1 from public.finance_rule_suggestions
       where user_id = old.user_id and category_id = old.id
     )
     or exists (
       select 1 from public.finance_candidate_transactions
       where user_id = old.user_id
         and nullif(payload ->> 'category_id', '')::uuid = old.id
     )
     or exists (
       select 1 from public.finance_corrections
       where user_id = old.user_id
         and field_name = 'category_id'
         and (
           nullif(previous_value #>> '{}', '')::uuid = old.id
           or nullif(corrected_value #>> '{}', '')::uuid = old.id
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'A referenced Finance category cannot change type';
  end if;

  return new;
end;
$function$;

create trigger finance_categories_guard_type_change
before update of type on public.finance_categories
for each row
execute function public.finance_guard_category_type_change();

-- Keep the existing Cron entry stable while changing its behavior from pending
-- suggestions to narrow active rules after three same-user/category/direction/
-- source corrections for the same normalized merchant.
create or replace function public.finance_refresh_rule_suggestions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  inserted_rows integer := 0;
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
    join public.finance_categories categories
      on categories.id = transactions.category_id
     and categories.user_id = transactions.user_id
     and categories.type = transactions.direction
     and categories.is_archived = false
    join public.finance_sources sources
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
  select count(*)::integer into inserted_rows
  from inserted;

  return inserted_rows;
end;
$function$;

create function public.finance_guard_learned_rule_core_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.source = 'learning' and (
    new.user_id is distinct from old.user_id
    or new.match_type is distinct from old.match_type
    or new.pattern is distinct from old.pattern
    or new.category_id is distinct from old.category_id
    or new.direction is distinct from old.direction
    or new.source is distinct from old.source
    or new.source_id is distinct from old.source_id
    or new.auto_created_at is distinct from old.auto_created_at
  ) then
    raise exception using errcode = '23514', message = 'Learned rule matching and target fields are immutable';
  end if;
  return new;
end;
$function$;

create trigger finance_rules_guard_learned_core_fields
before update on public.finance_rules
for each row
execute function public.finance_guard_learned_rule_core_fields();

comment on function public.finance_refresh_rule_suggestions() is
  'Cron-only compatibility entry point. Uses latest current, unambiguous category corrections; creates narrow learning rules after three matches and pauses unsupported generated rules.';

do $cron_schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'finance-rule-learning'
    and username = current_user
  order by jobid
  limit 1;

  if existing_job_id is null then
    perform cron.schedule(
      'finance-rule-learning',
      '15 3 * * *',
      'select public.finance_refresh_rule_suggestions();'
    );
  else
    perform cron.alter_job(
      existing_job_id,
      schedule := '15 3 * * *',
      command := 'select public.finance_refresh_rule_suggestions();',
      database := current_database(),
      username := current_user,
      active := true
    );
  end if;
end;
$cron_schedule$;

-- Close the default PUBLIC execute window immediately. The final enforcement
-- migration repeats this blanket rule and grants only these server RPCs.
revoke execute on function public.finance_normalize_merchant_key(text)
  from public, anon, authenticated;
revoke execute on function public.finance_normalize_reference_number(text)
  from public, anon, authenticated;
revoke execute on function public.finance_begin_screenshot_intake(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.finance_confirm_candidate(uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text, boolean, text, text)
  from public, anon, authenticated;
revoke execute on function public.finance_mark_candidate_duplicate(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_reject_candidate(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_update_transaction(uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.finance_delete_transaction(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_accept_rule_suggestion(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_delete_source(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_delete_category(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finance_validate_category_direction()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_validate_transaction_dimensions()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_validate_active_rule_dimensions()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_guard_archived_dimension()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_set_category_archived(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.finance_set_source_archived(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.finance_lock_ledger_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_validate_candidate_payload_dimensions()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_validate_correction_dimension_references()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_guard_category_type_change()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_guard_learned_rule_core_fields()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions()
  from public, anon, authenticated, service_role;

grant execute on function public.finance_normalize_merchant_key(text)
  to service_role;
grant execute on function public.finance_normalize_reference_number(text)
  to service_role;
grant execute on function public.finance_begin_screenshot_intake(uuid, text)
  to service_role;
grant execute on function public.finance_confirm_candidate(uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text, boolean, text, text)
  to service_role;
grant execute on function public.finance_mark_candidate_duplicate(uuid, uuid, uuid)
  to service_role;
grant execute on function public.finance_reject_candidate(uuid, uuid)
  to service_role;
grant execute on function public.finance_update_transaction(uuid, uuid, uuid, uuid, text, numeric, text, date, text, text, text)
  to service_role;
grant execute on function public.finance_delete_transaction(uuid, uuid)
  to service_role;
grant execute on function public.finance_accept_rule_suggestion(uuid, uuid)
  to service_role;
grant execute on function public.finance_delete_source(uuid, uuid)
  to service_role;
grant execute on function public.finance_delete_category(uuid, uuid)
  to service_role;
grant execute on function public.finance_set_category_archived(uuid, uuid, boolean)
  to service_role;
grant execute on function public.finance_set_source_archived(uuid, uuid, boolean)
  to service_role;

notify pgrst, 'reload schema';
