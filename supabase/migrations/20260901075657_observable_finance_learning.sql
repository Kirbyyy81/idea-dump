create function public.finance_jsonb_has_exact_keys(
  p_value jsonb,
  p_required text[],
  p_optional text[] default array[]::text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    pg_catalog.jsonb_typeof(p_value) = 'object'
    and p_value ?& p_required
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_value) as keys(key)
      where not (keys.key = any (p_required || p_optional))
    );
$function$;

create function public.finance_parser_template_configuration_is_valid(
  p_configuration jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  configuration_type text;
  phrase_count integer;
  distinct_phrase_count integer;
begin
  if pg_catalog.jsonb_typeof(p_configuration) <> 'object' then
    return false;
  end if;

  configuration_type := p_configuration ->> 'type';

  if configuration_type = 'source_phrase' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'phrase', 'location']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'phrase')) between 1 and 120
      and p_configuration ->> 'location' in ('filename', 'ocr_line', 'header', 'footer');
  elsif configuration_type = 'same_line_label' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'label'])
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'label')) between 1 and 120;
  elsif configuration_type = 'next_non_empty_line' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'label', 'max_lines']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'label')) between 1 and 120
      and pg_catalog.jsonb_typeof(p_configuration -> 'max_lines') = 'number'
      and p_configuration ->> 'max_lines' ~ '^[1-3]$'
      and (p_configuration ->> 'max_lines')::integer between 1 and 3;
  elsif configuration_type = 'bounded_line_window' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'anchor', 'direction', 'max_lines']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'anchor')) between 1 and 120
      and p_configuration ->> 'direction' in ('before', 'after')
      and pg_catalog.jsonb_typeof(p_configuration -> 'max_lines') = 'number'
      and p_configuration ->> 'max_lines' ~ '^[1-3]$'
      and (p_configuration ->> 'max_lines')::integer between 1 and 3;
  elsif configuration_type = 'allowlisted_regex_capture' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'pattern_id', 'anchor']
    )
      and p_configuration ->> 'pattern_id' in (
        'reference_token',
        'iso_date',
        'day_first_numeric_date',
        'day_first_named_date',
        'myr_amount'
      )
      and (
        p_configuration -> 'anchor' = 'null'::jsonb
        or (
          pg_catalog.jsonb_typeof(p_configuration -> 'anchor') = 'string'
          and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'anchor')) between 1 and 120
        )
      );
  elsif configuration_type in ('strip_prefix', 'strip_suffix') then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'value'])
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'value')) between 1 and 120;
  elsif configuration_type = 'character_filter' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'mode'])
      and p_configuration ->> 'mode' in ('digits_only', 'alphanumeric_only');
  elsif configuration_type = 'date_format' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'input_format'])
      and p_configuration ->> 'input_format' in (
        'yyyy-mm-dd',
        'dd/mm/yyyy',
        'dd-mm-yyyy',
        'dd.mm.yyyy',
        'dd mmm yyyy'
      );
  elsif configuration_type = 'numeric_separator' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'decimal_separator', 'grouping_separator']
    )
      and p_configuration ->> 'decimal_separator' in ('.', ',')
      and (
        p_configuration -> 'grouping_separator' = 'null'::jsonb
        or p_configuration ->> 'grouping_separator' in ('.', ',', ' ')
      )
      and (
        p_configuration -> 'grouping_separator' = 'null'::jsonb
        or p_configuration ->> 'grouping_separator' <> p_configuration ->> 'decimal_separator'
      );
  elsif configuration_type = 'direction_phrase' then
    if not public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'phrases', 'direction']
    )
      or pg_catalog.jsonb_typeof(p_configuration -> 'phrases') <> 'array'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_configuration -> 'phrases') as phrase(value)
        where pg_catalog.jsonb_typeof(phrase.value) <> 'string'
      )
      or p_configuration ->> 'direction' not in ('expense', 'income') then
      return false;
    end if;

    select
      pg_catalog.count(*)::integer,
      pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(phrases.value)))::integer
    into phrase_count, distinct_phrase_count
    from pg_catalog.jsonb_array_elements_text(p_configuration -> 'phrases') as phrases(value)
    where pg_catalog.char_length(pg_catalog.btrim(phrases.value)) between 1 and 120;

    return phrase_count between 1 and 10
      and phrase_count = pg_catalog.jsonb_array_length(p_configuration -> 'phrases')
      and phrase_count = distinct_phrase_count;
  elsif configuration_type = 'saved_payee_match' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'normalization'])
      and p_configuration ->> 'normalization' = 'canonical';
  end if;

  return false;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$function$;

create function public.finance_learning_reason_counts_are_valid(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    pg_catalog.jsonb_typeof(p_value) = 'object'
    and pg_catalog.octet_length(p_value::text) <= 4096
    and not exists (
      select 1
      from pg_catalog.jsonb_each(p_value) as reasons(reason, count_value)
      where reasons.reason not in (
        'insufficient_evidence',
        'contradiction',
        'invalid_output',
        'unresolved_missing_context',
        'source_archived',
        'conflict'
      )
        or pg_catalog.jsonb_typeof(reasons.count_value) <> 'number'
        or reasons.count_value::text !~ '^[0-9]+$'
    );
$function$;

create table public.finance_learning_runs (
  id uuid primary key default gen_random_uuid(),
  invocation_id uuid not null unique,
  algorithm_version integer not null default 1,
  status text not null default 'running',
  started_at timestamp with time zone not null default pg_catalog.clock_timestamp(),
  finished_at timestamp with time zone,
  corrections_examined integer not null default 0,
  templates_proposed integer not null default 0,
  templates_shadowed integer not null default 0,
  templates_activated integer not null default 0,
  templates_disabled integer not null default 0,
  templates_rejected integer not null default 0,
  legacy_rules_created integer not null default 0,
  legacy_rules_updated integer not null default 0,
  legacy_rules_disabled integer not null default 0,
  legacy_inserted_count integer not null default 0,
  reason_counts jsonb not null default '{}'::jsonb,
  failure_stage text,
  failure_code text,
  constraint finance_learning_runs_algorithm_version_check
    check (algorithm_version = 1),
  constraint finance_learning_runs_status_check
    check (status in ('running', 'succeeded', 'failed')),
  constraint finance_learning_runs_counts_check
    check (
      corrections_examined >= 0
      and templates_proposed >= 0
      and templates_shadowed >= 0
      and templates_activated >= 0
      and templates_disabled >= 0
      and templates_rejected >= 0
      and legacy_rules_created >= 0
      and legacy_rules_updated >= 0
      and legacy_rules_disabled >= 0
      and legacy_inserted_count >= 0
    ),
  constraint finance_learning_runs_reason_counts_check
    check (public.finance_learning_reason_counts_are_valid(reason_counts)),
  constraint finance_learning_runs_failure_check
    check (
      (status = 'running' and finished_at is null and failure_stage is null and failure_code is null)
      or (
        status = 'succeeded'
        and finished_at is not null
        and failure_stage is null
        and failure_code is null
      )
      or (
        status = 'failed'
        and finished_at is not null
        and pg_catalog.char_length(failure_stage) between 1 and 64
        and pg_catalog.char_length(failure_code) between 1 and 64
        and failure_stage ~ '^[a-z0-9_]+$'
        and failure_code ~ '^[a-z0-9_]+$'
      )
    )
);

create table public.finance_learning_run_user_summaries (
  run_id uuid not null references public.finance_learning_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  corrections_examined integer not null default 0,
  category_rules_created integer not null default 0,
  category_rules_updated integer not null default 0,
  category_rules_disabled integer not null default 0,
  reference_rules_created integer not null default 0,
  reference_rules_updated integer not null default 0,
  reference_rules_disabled integer not null default 0,
  reason_counts jsonb not null default '{}'::jsonb,
  primary key (run_id, user_id),
  constraint finance_learning_run_user_summaries_counts_check
    check (
      corrections_examined >= 0
      and category_rules_created >= 0
      and category_rules_updated >= 0
      and category_rules_disabled >= 0
      and reference_rules_created >= 0
      and reference_rules_updated >= 0
      and reference_rules_disabled >= 0
    ),
  constraint finance_learning_run_user_summaries_reason_counts_check
    check (public.finance_learning_reason_counts_are_valid(reason_counts))
);

create table public.finance_parser_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  target_source_id uuid,
  scope_source_id uuid,
  field_name text not null,
  template_type text not null,
  configuration jsonb not null,
  algorithm_version integer not null default 1,
  template_version integer not null,
  status text not null default 'proposed',
  evidence_count integer not null default 0,
  contradiction_count integer not null default 0,
  evaluation_count integer not null default 0,
  precision numeric(7,6),
  coverage numeric(7,6),
  predecessor_template_id uuid,
  status_reason text,
  created_at timestamp with time zone not null default now(),
  evaluated_at timestamp with time zone,
  activated_at timestamp with time zone,
  disabled_at timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint finance_parser_templates_id_user_key
    unique (id, user_id),
  constraint finance_parser_templates_id_user_algorithm_key
    unique (id, user_id, algorithm_version),
  constraint finance_parser_templates_version_identity_key
    unique (user_id, template_key, algorithm_version, template_version),
  constraint finance_parser_templates_target_source_user_fkey
    foreign key (target_source_id, user_id)
    references public.dim_finance_sources(id, user_id)
    on delete no action deferrable initially deferred,
  constraint finance_parser_templates_scope_source_user_fkey
    foreign key (scope_source_id, user_id)
    references public.dim_finance_sources(id, user_id)
    on delete no action deferrable initially deferred,
  constraint finance_parser_templates_predecessor_user_fkey
    foreign key (predecessor_template_id, user_id)
    references public.finance_parser_templates(id, user_id)
    on delete set null (predecessor_template_id),
  constraint finance_parser_templates_template_key_check
    check (
      pg_catalog.char_length(template_key) between 1 and 128
      and template_key ~ '^[a-z0-9][a-z0-9:_-]*$'
    ),
  constraint finance_parser_templates_field_check
    check (field_name in (
      'source_id',
      'reference_number',
      'merchant',
      'transaction_date',
      'direction',
      'payee_name',
      'notes',
      'recipient_reference',
      'amount'
    )),
  constraint finance_parser_templates_type_check
    check (template_type in (
      'source_phrase',
      'same_line_label',
      'next_non_empty_line',
      'bounded_line_window',
      'allowlisted_regex_capture',
      'strip_prefix',
      'strip_suffix',
      'character_filter',
      'date_format',
      'numeric_separator',
      'direction_phrase',
      'saved_payee_match'
    )),
  constraint finance_parser_templates_field_type_check
    check (
      (template_type = 'source_phrase' and field_name = 'source_id')
      or (template_type in ('same_line_label', 'next_non_empty_line', 'bounded_line_window') and field_name <> 'source_id')
      or (template_type = 'allowlisted_regex_capture' and field_name in ('reference_number', 'transaction_date', 'recipient_reference', 'amount'))
      or (template_type in ('strip_prefix', 'strip_suffix', 'character_filter') and field_name = 'reference_number')
      or (template_type = 'date_format' and field_name = 'transaction_date')
      or (template_type = 'numeric_separator' and field_name = 'amount')
      or (template_type = 'direction_phrase' and field_name = 'direction')
      or (template_type = 'saved_payee_match' and field_name = 'payee_name')
    ),
  constraint finance_parser_templates_source_scope_check
    check (
      (
        field_name = 'source_id'
        and target_source_id is not null
        and scope_source_id is null
      )
      or (
        field_name <> 'source_id'
        and target_source_id is null
        and scope_source_id is not null
      )
    ),
  constraint finance_parser_templates_configuration_check
    check (
      pg_catalog.octet_length(configuration::text) <= 4096
      and configuration ->> 'type' = template_type
      and public.finance_parser_template_configuration_is_valid(configuration)
      and (
        template_type <> 'allowlisted_regex_capture'
        or (configuration ->> 'pattern_id' = 'reference_token' and field_name in ('reference_number', 'recipient_reference'))
        or (configuration ->> 'pattern_id' in ('iso_date', 'day_first_numeric_date', 'day_first_named_date') and field_name = 'transaction_date')
        or (configuration ->> 'pattern_id' = 'myr_amount' and field_name = 'amount')
      )
    ),
  constraint finance_parser_templates_version_check
    check (algorithm_version = 1 and template_version >= 1),
  constraint finance_parser_templates_status_check
    check (status in ('proposed', 'shadow', 'active', 'rejected', 'disabled')),
  constraint finance_parser_templates_metrics_check
    check (
      evidence_count >= 0
      and contradiction_count >= 0
      and evaluation_count >= 0
      and (precision is null or precision between 0 and 1)
      and (coverage is null or coverage between 0 and 1)
    ),
  constraint finance_parser_templates_status_reason_check
    check (status_reason is null or pg_catalog.char_length(status_reason) between 1 and 200),
  constraint finance_parser_templates_status_timestamps_check
    check (
      (status = 'proposed' and activated_at is null and disabled_at is null)
      or (status = 'shadow' and evaluated_at is not null)
      or (status = 'active' and evaluated_at is not null and activated_at is not null and disabled_at is null)
      or (status = 'rejected' and activated_at is null and disabled_at is null and status_reason is not null)
      or (status = 'disabled' and activated_at is not null and disabled_at is not null and status_reason is not null)
    )
);

do $tenant_evidence_keys$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'finance_candidate_transactions_id_user_id_key'
      and conrelid = 'public.finance_candidate_transactions'::regclass
  ) then
    alter table public.finance_candidate_transactions
      add constraint finance_candidate_transactions_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'finance_corrections_id_user_id_key'
      and conrelid = 'public.finance_corrections'::regclass
  ) then
    alter table public.finance_corrections
      add constraint finance_corrections_id_user_id_key unique (id, user_id);
  end if;
end;
$tenant_evidence_keys$;

create table public.finance_template_evidence (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  correction_id uuid,
  candidate_id uuid,
  intake_item_id uuid,
  outcome text not null,
  algorithm_version integer not null default 1,
  created_at timestamp with time zone not null default now(),
  constraint finance_template_evidence_template_user_version_fkey
    foreign key (template_id, user_id, algorithm_version)
    references public.finance_parser_templates(id, user_id, algorithm_version)
    on delete cascade,
  constraint finance_template_evidence_correction_user_fkey
    foreign key (correction_id, user_id)
    references public.finance_corrections(id, user_id)
    on delete cascade,
  constraint finance_template_evidence_candidate_user_fkey
    foreign key (candidate_id, user_id)
    references public.finance_candidate_transactions(id, user_id)
    on delete cascade,
  constraint finance_template_evidence_intake_user_fkey
    foreign key (intake_item_id, user_id)
    references public.finance_intake_items(id, user_id)
    on delete cascade,
  constraint finance_template_evidence_reference_check
    check (pg_catalog.num_nonnulls(correction_id, candidate_id, intake_item_id) >= 1),
  constraint finance_template_evidence_outcome_check
    check (outcome in (
      'supported',
      'contradicted',
      'not_applicable',
      'invalid_output',
      'unresolved_missing_context'
    )),
  constraint finance_template_evidence_algorithm_version_check
    check (algorithm_version = 1)
);

create unique index finance_template_evidence_correction_unique_idx
  on public.finance_template_evidence(template_id, correction_id)
  where correction_id is not null;
create unique index finance_template_evidence_candidate_unique_idx
  on public.finance_template_evidence(template_id, candidate_id)
  where candidate_id is not null;
create unique index finance_template_evidence_intake_unique_idx
  on public.finance_template_evidence(template_id, intake_item_id)
  where intake_item_id is not null;

create index finance_learning_runs_completed_idx
  on public.finance_learning_runs(finished_at desc, id desc)
  where status in ('succeeded', 'failed');
create index finance_learning_run_user_summaries_user_run_idx
  on public.finance_learning_run_user_summaries(user_id, run_id);
create index finance_parser_templates_user_status_field_idx
  on public.finance_parser_templates(user_id, status, field_name);
create index finance_parser_templates_user_scope_field_status_idx
  on public.finance_parser_templates(user_id, scope_source_id, field_name, status);
create index finance_parser_templates_active_lookup_idx
  on public.finance_parser_templates(user_id, field_name, scope_source_id, target_source_id, activated_at, id)
  where status = 'active';
create index finance_parser_templates_shadow_lookup_idx
  on public.finance_parser_templates(user_id, field_name, scope_source_id, target_source_id, evaluated_at, id)
  where status = 'shadow';
create index finance_parser_templates_predecessor_user_idx
  on public.finance_parser_templates(predecessor_template_id, user_id)
  where predecessor_template_id is not null;
create index finance_parser_templates_target_source_user_idx
  on public.finance_parser_templates(target_source_id, user_id)
  where target_source_id is not null;
create index finance_parser_templates_scope_source_user_idx
  on public.finance_parser_templates(scope_source_id, user_id)
  where scope_source_id is not null;
create index finance_template_evidence_user_idx
  on public.finance_template_evidence(user_id);
create index finance_template_evidence_template_user_idx
  on public.finance_template_evidence(template_id, user_id, created_at);
create index finance_template_evidence_correction_user_idx
  on public.finance_template_evidence(correction_id, user_id)
  where correction_id is not null;
create index finance_template_evidence_candidate_user_idx
  on public.finance_template_evidence(candidate_id, user_id)
  where candidate_id is not null;
create index finance_template_evidence_intake_user_idx
  on public.finance_template_evidence(intake_item_id, user_id)
  where intake_item_id is not null;

create function public.finance_guard_parser_template_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  active_scope_count integer;
  source_is_active boolean;
begin
  if tg_op = 'INSERT' and new.status <> 'proposed' then
    raise exception using errcode = '23514', message = 'Parser templates must begin as proposed';
  end if;

  if tg_op = 'UPDATE' then
    if row(
      new.user_id,
      new.template_key,
      new.target_source_id,
      new.scope_source_id,
      new.field_name,
      new.template_type,
      new.configuration,
      new.algorithm_version,
      new.template_version,
      new.predecessor_template_id
    ) is distinct from row(
      old.user_id,
      old.template_key,
      old.target_source_id,
      old.scope_source_id,
      old.field_name,
      old.template_type,
      old.configuration,
      old.algorithm_version,
      old.template_version,
      old.predecessor_template_id
    ) then
      raise exception using errcode = '23514', message = 'Parser template identity is immutable';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'proposed' and new.status in ('shadow', 'rejected'))
      or (old.status = 'shadow' and new.status in ('active', 'rejected'))
      or (old.status = 'active' and new.status = 'disabled')
      or (old.status = 'disabled' and new.status = 'shadow')
      or (old.status = 'rejected' and new.status = 'proposed')
    ) then
      raise exception using errcode = '23514', message = 'Invalid parser template lifecycle transition';
    end if;
  end if;

  if new.status = 'shadow' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.evaluated_at := pg_catalog.coalesce(new.evaluated_at, pg_catalog.clock_timestamp());
    new.activated_at := null;
    new.disabled_at := null;
  elsif new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.evaluated_at := pg_catalog.coalesce(new.evaluated_at, pg_catalog.clock_timestamp());
    new.activated_at := pg_catalog.clock_timestamp();
    new.disabled_at := null;
  elsif new.status = 'disabled' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.disabled_at := pg_catalog.coalesce(new.disabled_at, pg_catalog.clock_timestamp());
  elsif new.status = 'proposed' and tg_op = 'UPDATE' and old.status = 'rejected' then
    new.evaluated_at := null;
    new.activated_at := null;
    new.disabled_at := null;
    new.status_reason := null;
  end if;

  if new.status in ('shadow', 'active') then
    select not sources.is_archived into source_is_active
    from public.dim_finance_sources sources
    where sources.id = pg_catalog.coalesce(new.scope_source_id, new.target_source_id)
      and sources.user_id = new.user_id;

    if source_is_active is distinct from true then
      raise exception using errcode = '23514', message = 'Parser template source must be active';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.user_id::text || ':' || new.field_name || ':' || pg_catalog.coalesce(
          new.scope_source_id::text,
          new.target_source_id::text
        ),
        1
      )
    );

    select pg_catalog.count(*)::integer into active_scope_count
    from public.finance_parser_templates templates
    where templates.user_id = new.user_id
      and templates.field_name = new.field_name
      and pg_catalog.coalesce(templates.scope_source_id, templates.target_source_id)
        = pg_catalog.coalesce(new.scope_source_id, new.target_source_id)
      and templates.status in ('active', 'shadow')
      and templates.id <> new.id;

    if active_scope_count >= 20 then
      raise exception using errcode = '23514', message = 'Parser template runtime scope limit exceeded';
    end if;
  end if;

  if new.status = 'active' and (
    new.evidence_count < 3
    or new.contradiction_count > 0
    or (
      new.field_name in ('source_id', 'reference_number', 'transaction_date', 'amount')
      and new.precision is distinct from 1::numeric
    )
  ) then
    raise exception using errcode = '23514', message = 'Parser template does not meet activation gates';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger finance_parser_templates_guard_write
before insert or update on public.finance_parser_templates
for each row execute function public.finance_guard_parser_template_write();

alter table public.finance_learning_runs enable row level security;
alter table public.finance_learning_run_user_summaries enable row level security;
alter table public.finance_parser_templates enable row level security;
alter table public.finance_template_evidence enable row level security;

create policy server_only_deny on public.finance_learning_runs
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy server_only_deny on public.finance_learning_run_user_summaries
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy server_only_deny on public.finance_parser_templates
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy server_only_deny on public.finance_template_evidence
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table
  public.finance_learning_runs,
  public.finance_learning_run_user_summaries,
  public.finance_parser_templates,
  public.finance_template_evidence
from public, anon, authenticated, service_role;

grant select on table
  public.finance_learning_runs,
  public.finance_learning_run_user_summaries,
  public.finance_parser_templates,
  public.finance_template_evidence
to service_role;

alter function public.finance_refresh_rule_suggestions()
  rename to finance_refresh_rule_suggestions_legacy_v1;

create function public.finance_refresh_rule_suggestions(
  p_invocation_id uuid default gen_random_uuid()
)
returns integer
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '90s'
as $function$
declare
  run_row public.finance_learning_runs%rowtype;
  legacy_inserted_rows integer := 0;
  inserted_run_count integer := 0;
  transaction_started_at timestamp with time zone := now();
  failure_sqlstate text;
  safe_failure_code text;
begin
  if p_invocation_id is null then
    raise exception using errcode = '22023', message = 'Learning invocation ID is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_refresh_rule_suggestions', 1)
  );

  insert into public.finance_learning_runs(invocation_id)
  values (p_invocation_id)
  on conflict (invocation_id) do nothing;
  get diagnostics inserted_run_count = row_count;

  if inserted_run_count = 0 then
    select * into run_row
    from public.finance_learning_runs runs
    where runs.invocation_id = p_invocation_id;
    return pg_catalog.coalesce(run_row.legacy_inserted_count, 0);
  end if;

  select * into run_row
  from public.finance_learning_runs runs
  where runs.invocation_id = p_invocation_id;

  begin
    legacy_inserted_rows := public.finance_refresh_rule_suggestions_legacy_v1();

    with category_corrections as materialized (
      select distinct on (corrections.user_id, corrections.transaction_id)
        corrections.id,
        corrections.user_id
      from public.finance_corrections corrections
      join public.finance_transactions transactions
        on transactions.id = corrections.transaction_id
       and transactions.user_id = corrections.user_id
       and transactions.status = 'confirmed'
      where corrections.field_name = 'category_id'
        and corrections.transaction_id is not null
      order by
        corrections.user_id,
        corrections.transaction_id,
        corrections.created_at desc,
        corrections.id desc
    ), reference_corrections as materialized (
      select corrections.id, corrections.user_id
      from public.finance_corrections corrections
      join public.finance_transactions transactions
        on transactions.id = corrections.transaction_id
       and transactions.user_id = corrections.user_id
       and transactions.status = 'confirmed'
       and corrections.created_at = transactions.created_at
      where corrections.field_name = 'reference_number'
        and corrections.transaction_id is not null
        and pg_catalog.jsonb_typeof(corrections.previous_value) = 'string'
        and pg_catalog.jsonb_typeof(corrections.corrected_value) = 'string'
    ), examined as materialized (
      select id, user_id from category_corrections
      union
      select id, user_id from reference_corrections
    ), affected_users as materialized (
      select user_id from examined
      union
      select rules.user_id
      from public.finance_rules rules
      where rules.source = 'learning'
        and rules.auto_created_at is not null
        and rules.updated_at >= transaction_started_at
      union
      select rules.user_id
      from public.finance_field_learning_rules rules
      where rules.updated_at >= transaction_started_at
    )
    insert into public.finance_learning_run_user_summaries (
      run_id,
      user_id,
      corrections_examined,
      category_rules_created,
      category_rules_updated,
      category_rules_disabled,
      reference_rules_created,
      reference_rules_updated,
      reference_rules_disabled
    )
    select
      run_row.id,
      affected_users.user_id,
      (
        select pg_catalog.count(*)::integer
        from examined
        where examined.user_id = affected_users.user_id
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_rules rules
        where rules.user_id = affected_users.user_id
          and rules.source = 'learning'
          and rules.auto_created_at is not null
          and rules.created_at >= transaction_started_at
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_rules rules
        where rules.user_id = affected_users.user_id
          and rules.source = 'learning'
          and rules.auto_created_at is not null
          and rules.created_at < transaction_started_at
          and rules.updated_at >= transaction_started_at
          and rules.is_active = true
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_rules rules
        where rules.user_id = affected_users.user_id
          and rules.source = 'learning'
          and rules.auto_created_at is not null
          and rules.created_at < transaction_started_at
          and rules.updated_at >= transaction_started_at
          and rules.is_active = false
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_field_learning_rules rules
        where rules.user_id = affected_users.user_id
          and rules.created_at >= transaction_started_at
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_field_learning_rules rules
        where rules.user_id = affected_users.user_id
          and rules.created_at < transaction_started_at
          and rules.updated_at >= transaction_started_at
          and rules.is_active = true
      ),
      (
        select pg_catalog.count(*)::integer
        from public.finance_field_learning_rules rules
        where rules.user_id = affected_users.user_id
          and rules.created_at < transaction_started_at
          and rules.updated_at >= transaction_started_at
          and rules.is_active = false
      )
    from affected_users
    on conflict (run_id, user_id) do nothing;

    update public.finance_learning_runs runs
    set status = 'succeeded',
        finished_at = pg_catalog.clock_timestamp(),
        corrections_examined = totals.corrections_examined,
        legacy_rules_created = totals.rules_created,
        legacy_rules_updated = totals.rules_updated,
        legacy_rules_disabled = totals.rules_disabled,
        legacy_inserted_count = legacy_inserted_rows
    from (
      select
        pg_catalog.coalesce(pg_catalog.sum(summaries.corrections_examined), 0)::integer as corrections_examined,
        pg_catalog.coalesce(pg_catalog.sum(
          summaries.category_rules_created + summaries.reference_rules_created
        ), 0)::integer as rules_created,
        pg_catalog.coalesce(pg_catalog.sum(
          summaries.category_rules_updated + summaries.reference_rules_updated
        ), 0)::integer as rules_updated,
        pg_catalog.coalesce(pg_catalog.sum(
          summaries.category_rules_disabled + summaries.reference_rules_disabled
        ), 0)::integer as rules_disabled
      from public.finance_learning_run_user_summaries summaries
      where summaries.run_id = run_row.id
    ) totals
    where runs.id = run_row.id;

    delete from public.finance_learning_runs runs
    where runs.finished_at < pg_catalog.clock_timestamp() - interval '90 days'
      and runs.status in ('succeeded', 'failed');

    return legacy_inserted_rows;
  exception
    when others then
      get stacked diagnostics failure_sqlstate = returned_sqlstate;
      safe_failure_code := case
        when failure_sqlstate = '57014' then 'database_timeout'
        when failure_sqlstate in ('40001', '40P01') then 'database_retryable'
        when failure_sqlstate like '23%' then 'database_constraint'
        else 'learning_refresh_failed'
      end;

      update public.finance_learning_runs runs
      set status = 'failed',
          finished_at = pg_catalog.clock_timestamp(),
          failure_stage = 'legacy_rule_refresh',
          failure_code = safe_failure_code
      where runs.id = run_row.id;

      delete from public.finance_learning_runs runs
      where runs.finished_at < pg_catalog.clock_timestamp() - interval '90 days'
        and runs.status in ('succeeded', 'failed');

      return 0;
  end;
end;
$function$;

create function public.finance_learning_summary_v1(p_user_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  latest_run public.finance_learning_runs%rowtype;
  user_summary public.finance_learning_run_user_summaries%rowtype;
  template_counts jsonb;
  active_metrics jsonb;
  recent_outcomes jsonb;
  active_reference_rules integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Finance user ID is required';
  end if;

  select * into latest_run
  from public.finance_learning_runs runs
  where runs.status in ('succeeded', 'failed')
  order by runs.finished_at desc, runs.id desc
  limit 1;

  if latest_run.id is null then
    return pg_catalog.jsonb_build_object('availability', 'never_run');
  end if;

  select * into user_summary
  from public.finance_learning_run_user_summaries summaries
  where summaries.run_id = latest_run.id
    and summaries.user_id = p_user_id;

  select pg_catalog.jsonb_build_object(
    'active_source', pg_catalog.count(*) filter (
      where templates.status = 'active' and templates.field_name = 'source_id'
    ),
    'active_field', pg_catalog.count(*) filter (
      where templates.status = 'active' and templates.field_name <> 'source_id'
    ),
    'proposed', pg_catalog.count(*) filter (where templates.status = 'proposed'),
    'shadow', pg_catalog.count(*) filter (where templates.status = 'shadow'),
    'rejected', pg_catalog.count(*) filter (where templates.status = 'rejected'),
    'disabled', pg_catalog.count(*) filter (where templates.status = 'disabled')
  ) into template_counts
  from public.finance_parser_templates templates
  where templates.user_id = p_user_id;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(metrics.value order by metrics.field_name),
    '[]'::jsonb
  ) into active_metrics
  from (
    select
      templates.field_name,
      pg_catalog.jsonb_build_object(
        'field_name', templates.field_name,
        'template_count', pg_catalog.count(*),
        'minimum_precision', pg_catalog.min(templates.precision),
        'average_coverage', pg_catalog.avg(templates.coverage)
      ) as value
    from public.finance_parser_templates templates
    where templates.user_id = p_user_id
      and templates.status = 'active'
    group by templates.field_name
  ) metrics;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(outcomes.value order by outcomes.updated_at desc, outcomes.id desc),
    '[]'::jsonb
  ) into recent_outcomes
  from (
    select
      templates.id,
      templates.updated_at,
      pg_catalog.jsonb_build_object(
        'field_name', templates.field_name,
        'status', templates.status,
        'reason', templates.status_reason,
        'updated_at', templates.updated_at
      ) as value
    from public.finance_parser_templates templates
    where templates.user_id = p_user_id
      and templates.status in ('rejected', 'disabled')
    order by templates.updated_at desc, templates.id desc
    limit 5
  ) outcomes;

  select pg_catalog.count(*)::integer into active_reference_rules
  from public.finance_field_learning_rules rules
  where rules.user_id = p_user_id
    and rules.is_active = true;

  return pg_catalog.jsonb_build_object(
    'availability', 'available',
    'latest_run', pg_catalog.jsonb_build_object(
      'status', latest_run.status,
      'finished_at', latest_run.finished_at,
      'failure_code', latest_run.failure_code,
      'corrections_examined', pg_catalog.coalesce(user_summary.corrections_examined, 0),
      'category_rules_created', pg_catalog.coalesce(user_summary.category_rules_created, 0),
      'category_rules_updated', pg_catalog.coalesce(user_summary.category_rules_updated, 0),
      'category_rules_disabled', pg_catalog.coalesce(user_summary.category_rules_disabled, 0),
      'reference_rules_created', pg_catalog.coalesce(user_summary.reference_rules_created, 0),
      'reference_rules_updated', pg_catalog.coalesce(user_summary.reference_rules_updated, 0),
      'reference_rules_disabled', pg_catalog.coalesce(user_summary.reference_rules_disabled, 0)
    ),
    'template_counts', template_counts,
    'active_reference_rules', active_reference_rules,
    'active_metrics', active_metrics,
    'recent_outcomes', recent_outcomes
  );
end;
$function$;

comment on table public.finance_learning_runs is
  'Authoritative privacy-safe business outcomes for Finance learning refreshes.';
comment on table public.finance_learning_run_user_summaries is
  'User-scoped aggregate outcomes for Finance settings without correction values.';
comment on table public.finance_parser_templates is
  'Versioned bounded OCR parser templates. Phase 1 stores the contract but does not apply templates.';
comment on table public.finance_template_evidence is
  'Tenant-safe reviewed evidence relationships without duplicated OCR or correction payloads.';
comment on function public.finance_refresh_rule_suggestions(uuid) is
  'Cron-only observable learning entry point. Preserves legacy category and reference learning behavior.';
comment on function public.finance_learning_summary_v1(uuid) is
  'Returns a privacy-safe user-scoped Finance learning summary for the server settings boundary.';

revoke execute on function public.finance_jsonb_has_exact_keys(jsonb, text[], text[])
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_parser_template_configuration_is_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_learning_reason_counts_are_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_guard_parser_template_write()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions_legacy_v1()
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_learning_summary_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finance_learning_summary_v1(uuid)
  to service_role;

notify pgrst, 'reload schema';
