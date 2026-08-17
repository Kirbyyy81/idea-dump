set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Acquire every relation used by the merge in one documented order. This
-- prevents new references from appearing between survivor selection and the
-- final category delete.
lock table
  public.finance_candidate_transactions,
  public.finance_corrections,
  public.finance_rule_suggestions,
  public.finance_rules,
  public.finance_transactions,
  public.dim_finance_categories
in share row exclusive mode;

-- Production Finance foreign keys are initially deferred. Make them immediate
-- for this migration so each repoint is checked before the replacement unique
-- index is built, leaving no pending trigger events on the category table.
set constraints all immediate;

-- Direction remains a property of transactions and rules, not categories.
drop trigger if exists finance_transactions_validate_category_direction
  on public.finance_transactions;
drop trigger if exists finance_rules_validate_category_direction
  on public.finance_rules;
drop trigger if exists finance_rule_suggestions_validate_category_direction
  on public.finance_rule_suggestions;
drop trigger if exists finance_categories_guard_type_change
  on public.dim_finance_categories;

-- Prepare the compatibility column before any reference rewrite queues
-- deferred foreign-key trigger checks against the category table.
alter table public.dim_finance_categories
  drop constraint if exists finance_categories_user_id_type_name_key,
  alter column type set default 'expense';

-- Remove category type predicates from the database entry points that remain
-- in service during the compatibility deployment. Rebuilding from the current
-- definitions preserves signatures, ownership, comments, and execute grants.
do $refresh_category_routines$
declare
  function_row record;
  refreshed_definition text;
  refreshed_count integer := 0;
begin
  for function_row in
    select
      procedures.oid::regprocedure::text as signature,
      pg_catalog.pg_get_functiondef(procedures.oid) as definition
    from pg_catalog.pg_proc procedures
    join pg_catalog.pg_namespace namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname = any (array[
        'finance_accept_rule_suggestion'::text,
        'finance_confirm_candidate'::text,
        'finance_refresh_rule_suggestions'::text,
        'finance_update_transaction'::text,
        'finance_validate_active_rule_dimensions'::text,
        'finance_validate_candidate_payload_dimensions'::text
      ])
    order by procedures.oid
  loop
    refreshed_definition := function_row.definition;
    refreshed_definition := pg_catalog.regexp_replace(
      refreshed_definition,
      'and[[:space:]]+categories\.type[[:space:]]*=[[:space:]]*transactions\.direction',
      '',
      'gi'
    );
    refreshed_definition := pg_catalog.regexp_replace(
      refreshed_definition,
      'and[[:space:]]+type[[:space:]]*=[[:space:]]*p_direction',
      '',
      'gi'
    );
    refreshed_definition := pg_catalog.regexp_replace(
      refreshed_definition,
      'and[[:space:]]+type[[:space:]]*=[[:space:]]*suggestion_row\.direction',
      '',
      'gi'
    );
    refreshed_definition := pg_catalog.regexp_replace(
      refreshed_definition,
      'and[[:space:]]+\(new\.direction[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+type[[:space:]]*=[[:space:]]*new\.direction\)',
      '',
      'gi'
    );
    refreshed_definition := pg_catalog.regexp_replace(
      refreshed_definition,
      'and[[:space:]]+\(candidate_direction[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+type[[:space:]]*=[[:space:]]*candidate_direction\)',
      '',
      'gi'
    );

    if refreshed_definition = function_row.definition then
      raise exception 'Expected a category type predicate in %', function_row.signature;
    end if;

    execute refreshed_definition;
    refreshed_count := refreshed_count + 1;
  end loop;

  if refreshed_count <> 6 then
    raise exception 'Expected to refresh 6 Finance category routines, refreshed %', refreshed_count;
  end if;
end;
$refresh_category_routines$;

create temporary table finance_category_merge_map (
  duplicate_id uuid primary key,
  survivor_id uuid not null,
  user_id uuid not null
) on commit drop;

with reference_events as materialized (
  select transactions.category_id, pg_catalog.count(*)::bigint as reference_count
  from public.finance_transactions transactions
  where transactions.category_id is not null
  group by transactions.category_id

  union all

  select rules.category_id, pg_catalog.count(*)::bigint
  from public.finance_rules rules
  where rules.category_id is not null
  group by rules.category_id

  union all

  select suggestions.category_id, pg_catalog.count(*)::bigint
  from public.finance_rule_suggestions suggestions
  where suggestions.category_id is not null
  group by suggestions.category_id

  union all

  select categories.id, pg_catalog.count(*)::bigint
  from public.finance_candidate_transactions candidates
  join public.dim_finance_categories categories
    on categories.user_id = candidates.user_id
   and candidates.payload ->> 'category_id' = categories.id::text
  group by categories.id

  union all

  select categories.id, pg_catalog.count(*)::bigint
  from public.finance_corrections corrections
  join public.dim_finance_categories categories
    on categories.user_id = corrections.user_id
   and corrections.field_name = 'category_id'
   and (
     corrections.previous_value #>> '{}' = categories.id::text
     or corrections.corrected_value #>> '{}' = categories.id::text
   )
  group by categories.id
), reference_counts as materialized (
  select
    reference_events.category_id,
    pg_catalog.sum(reference_events.reference_count)::bigint as reference_count
  from reference_events
  group by reference_events.category_id
), category_scores as materialized (
  select
    categories.id,
    categories.user_id,
    pg_catalog.lower(pg_catalog.btrim(categories.name)) as canonical_name,
    categories.is_archived,
    coalesce(reference_counts.reference_count, 0::bigint) as reference_count,
    categories.created_at
  from public.dim_finance_categories categories
  left join reference_counts
    on reference_counts.category_id = categories.id
), ranked_categories as materialized (
  select
    category_scores.id,
    category_scores.user_id,
    pg_catalog.first_value(category_scores.id) over (
      partition by category_scores.user_id, category_scores.canonical_name
      order by
        category_scores.is_archived asc,
        category_scores.reference_count desc,
        category_scores.created_at asc,
        category_scores.id asc
    ) as survivor_id
  from category_scores
)
insert into pg_temp.finance_category_merge_map (
  duplicate_id,
  survivor_id,
  user_id
)
select
  ranked_categories.id,
  ranked_categories.survivor_id,
  ranked_categories.user_id
from ranked_categories
where ranked_categories.id <> ranked_categories.survivor_id;

-- Updating category targets is an intentional one-time rewrite of learned rule
-- core fields. Transaction dimension guards are also paused because historical
-- rows may legitimately retain an archived category.
alter table public.finance_rules
  disable trigger finance_rules_guard_learned_core_fields;
alter table public.finance_transactions
  disable trigger finance_transactions_validate_active_dimensions;
alter table public.finance_transactions
  disable trigger finance_transactions_lock_ledger_mutation;

create temporary table finance_learned_rule_merge_map (
  duplicate_rule_id uuid primary key,
  survivor_rule_id uuid not null,
  survivor_evidence_count integer
) on commit drop;

with affected_rules as materialized (
  select
    rules.id,
    rules.user_id,
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(rules.pattern),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) as normalized_pattern,
    coalesce(category_map.survivor_id, rules.category_id) as target_category_id,
    rules.direction,
    rules.source_id,
    rules.is_active,
    rules.learning_evidence_count,
    rules.auto_created_at,
    rules.created_at
  from public.finance_rules rules
  left join pg_temp.finance_category_merge_map category_map
    on category_map.duplicate_id = rules.category_id
  where rules.auto_created_at is not null
    and rules.source_id is not null
    and rules.direction is not null
    and exists (
      select 1
      from pg_temp.finance_category_merge_map affected_map
      where rules.category_id in (affected_map.duplicate_id, affected_map.survivor_id)
    )
), ranked_rules as materialized (
  select
    affected_rules.id,
    pg_catalog.first_value(affected_rules.id) over (
      partition by
        affected_rules.user_id,
        affected_rules.normalized_pattern,
        affected_rules.target_category_id,
        affected_rules.direction,
        affected_rules.source_id
      order by
        affected_rules.is_active desc,
        affected_rules.learning_evidence_count desc nulls last,
        affected_rules.auto_created_at asc,
        affected_rules.created_at asc,
        affected_rules.id asc
    ) as survivor_rule_id,
    pg_catalog.max(affected_rules.learning_evidence_count) over (
      partition by
        affected_rules.user_id,
        affected_rules.normalized_pattern,
        affected_rules.target_category_id,
        affected_rules.direction,
        affected_rules.source_id
    ) as survivor_evidence_count,
    pg_catalog.row_number() over (
      partition by
        affected_rules.user_id,
        affected_rules.normalized_pattern,
        affected_rules.target_category_id,
        affected_rules.direction,
        affected_rules.source_id
      order by
        affected_rules.is_active desc,
        affected_rules.learning_evidence_count desc nulls last,
        affected_rules.auto_created_at asc,
        affected_rules.created_at asc,
        affected_rules.id asc
    ) as merge_rank
  from affected_rules
)
insert into pg_temp.finance_learned_rule_merge_map (
  duplicate_rule_id,
  survivor_rule_id,
  survivor_evidence_count
)
select
  ranked_rules.id,
  ranked_rules.survivor_rule_id,
  ranked_rules.survivor_evidence_count
from ranked_rules
where ranked_rules.merge_rank > 1;

update public.finance_candidate_transactions candidates
set matched_rule_id = rule_map.survivor_rule_id
from pg_temp.finance_learned_rule_merge_map rule_map
where candidates.matched_rule_id = rule_map.duplicate_rule_id;

update public.finance_rules rules
set learning_evidence_count = survivor_rules.survivor_evidence_count,
    updated_at = pg_catalog.now()
from (
  select distinct
    rule_map.survivor_rule_id,
    rule_map.survivor_evidence_count
  from pg_temp.finance_learned_rule_merge_map rule_map
) survivor_rules
where rules.id = survivor_rules.survivor_rule_id
  and rules.learning_evidence_count
      is distinct from survivor_rules.survivor_evidence_count;

delete from public.finance_rules rules
using pg_temp.finance_learned_rule_merge_map rule_map
where rules.id = rule_map.duplicate_rule_id;

update public.finance_transactions transactions
set category_id = category_map.survivor_id
from pg_temp.finance_category_merge_map category_map
where transactions.category_id = category_map.duplicate_id
  and transactions.user_id = category_map.user_id;

update public.finance_rules rules
set category_id = category_map.survivor_id
from pg_temp.finance_category_merge_map category_map
where rules.category_id = category_map.duplicate_id
  and rules.user_id = category_map.user_id;

update public.finance_rule_suggestions suggestions
set category_id = category_map.survivor_id
from pg_temp.finance_category_merge_map category_map
where suggestions.category_id = category_map.duplicate_id
  and suggestions.user_id = category_map.user_id;

update public.finance_candidate_transactions candidates
set payload = pg_catalog.jsonb_set(
  coalesce(candidates.payload, '{}'::jsonb),
  '{category_id}',
  pg_catalog.to_jsonb(category_map.survivor_id::text),
  true
)
from pg_temp.finance_category_merge_map category_map
where candidates.user_id = category_map.user_id
  and candidates.payload ->> 'category_id' = category_map.duplicate_id::text;

update public.finance_corrections corrections
set previous_value = pg_catalog.to_jsonb(category_map.survivor_id::text)
from pg_temp.finance_category_merge_map category_map
where corrections.user_id = category_map.user_id
  and corrections.field_name = 'category_id'
  and corrections.previous_value #>> '{}' = category_map.duplicate_id::text;

update public.finance_corrections corrections
set corrected_value = pg_catalog.to_jsonb(category_map.survivor_id::text)
from pg_temp.finance_category_merge_map category_map
where corrections.user_id = category_map.user_id
  and corrections.field_name = 'category_id'
  and corrections.corrected_value #>> '{}' = category_map.duplicate_id::text;

do $verify_repointed_categories$
begin
  if exists (
    select 1
    from pg_temp.finance_category_merge_map category_map
    where exists (
      select 1
      from public.finance_transactions transactions
      where transactions.user_id = category_map.user_id
        and transactions.category_id = category_map.duplicate_id
    )
    or exists (
      select 1
      from public.finance_rules rules
      where rules.user_id = category_map.user_id
        and rules.category_id = category_map.duplicate_id
    )
    or exists (
      select 1
      from public.finance_rule_suggestions suggestions
      where suggestions.user_id = category_map.user_id
        and suggestions.category_id = category_map.duplicate_id
    )
    or exists (
      select 1
      from public.finance_candidate_transactions candidates
      where candidates.user_id = category_map.user_id
        and candidates.payload ->> 'category_id' = category_map.duplicate_id::text
    )
    or exists (
      select 1
      from public.finance_corrections corrections
      where corrections.user_id = category_map.user_id
        and corrections.field_name = 'category_id'
        and (
          corrections.previous_value #>> '{}' = category_map.duplicate_id::text
          or corrections.corrected_value #>> '{}' = category_map.duplicate_id::text
        )
    )
  ) then
    raise exception 'Finance category merge left a reference to a duplicate category';
  end if;
end;
$verify_repointed_categories$;

delete from public.dim_finance_categories categories
using pg_temp.finance_category_merge_map category_map
where categories.id = category_map.duplicate_id
  and categories.user_id = category_map.user_id;

drop index if exists public.finance_categories_user_type_name_canonical_idx;

create unique index finance_categories_user_name_canonical_idx
  on public.dim_finance_categories (user_id, pg_catalog.lower(pg_catalog.btrim(name)));

comment on column public.dim_finance_categories.type is
  'Temporary compatibility column. Shared categories no longer use this value and the next migration removes it.';

alter table public.finance_transactions
  enable trigger finance_transactions_lock_ledger_mutation;
alter table public.finance_transactions
  enable trigger finance_transactions_validate_active_dimensions;
alter table public.finance_rules
  enable trigger finance_rules_guard_learned_core_fields;

notify pgrst, 'reload schema';
