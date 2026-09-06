alter table public.finance_learning_runs
  add column critical_field_learning_completed_at timestamp with time zone;

create function public.finance_normalize_critical_field_value(
  p_field_name text,
  p_value text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  normalized_value text;
  parts text[];
begin
  normalized_value := nullif(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  if normalized_value is null then
    return null;
  end if;

  if p_field_name = 'reference_number' then
    if pg_catalog.char_length(normalized_value) > 200 or normalized_value !~ '[[:alnum:]]' then
      return null;
    end if;
    return pg_catalog.upper(normalized_value);
  elsif p_field_name = 'merchant' then
    if pg_catalog.char_length(normalized_value) > 500 or normalized_value !~ '[[:alnum:]]' then
      return null;
    end if;
    return pg_catalog.lower(normalized_value);
  elsif p_field_name = 'transaction_date' then
    parts := pg_catalog.regexp_match(normalized_value, '^\s*(20[0-9]{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?[0-9]|3[01])\s*$');
    if parts is not null then
      return pg_catalog.make_date(parts[1]::integer, parts[2]::integer, parts[3]::integer)::text;
    end if;
    parts := pg_catalog.regexp_match(normalized_value, '^\s*([0-2]?[0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20[0-9]{2})\s*$');
    if parts is not null then
      return pg_catalog.make_date(parts[3]::integer, parts[2]::integer, parts[1]::integer)::text;
    end if;
  end if;
  return null;
exception
  when datetime_field_overflow or invalid_datetime_format then
    return null;
end;
$function$;

create function public.finance_safe_critical_field_label(
  p_field_name text,
  p_value text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  normalized_label text;
begin
  normalized_label := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_value, '')),
    '[[:space:]]+',
    ' ',
    'g'
  ));
  if pg_catalog.char_length(normalized_label) not between 1 and 120 then
    return null;
  end if;
  if p_field_name = 'reference_number' and normalized_label in (
    'reference', 'reference number', 'ref', 'transaction id', 'transaction reference',
    'receipt number', 'order id', 'invoice number'
  ) then
    return normalized_label;
  elsif p_field_name = 'merchant' and normalized_label in (
    'merchant', 'merchant name', 'store', 'shop', 'seller', 'biller', 'paid to', 'payment to'
  ) then
    return normalized_label;
  elsif p_field_name = 'transaction_date' and normalized_label in (
    'date', 'transaction date', 'payment date', 'transfer date', 'receipt date'
  ) then
    return normalized_label;
  end if;
  return null;
end;
$function$;

create function public.finance_critical_field_candidate_configurations(
  p_ocr_text text,
  p_field_name text,
  p_corrected_value text
)
returns table(template_type text, configuration jsonb)
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  bounded_lines text[];
  line_number integer;
  next_line integer;
  non_empty_distance integer;
  captures text[];
  safe_label text;
  corrected_value text;
begin
  if p_field_name not in ('reference_number', 'merchant', 'transaction_date') then
    return;
  end if;
  corrected_value := public.finance_normalize_critical_field_value(p_field_name, p_corrected_value);
  if corrected_value is null then
    return;
  end if;
  bounded_lines := pg_catalog.regexp_split_to_array(
    pg_catalog.left(coalesce(p_ocr_text, ''), 20000),
    E'\r?\n'
  );
  if coalesce(pg_catalog.cardinality(bounded_lines), 0) = 0 then
    return;
  end if;

  for line_number in 1..least(200, pg_catalog.cardinality(bounded_lines)) loop
    captures := pg_catalog.regexp_match(
      bounded_lines[line_number],
      '^[[:space:]]*(.{1,120}?)[[:space:]]*[:-][[:space:]]*(.+?)[[:space:]]*$'
    );
    if captures is not null then
      safe_label := public.finance_safe_critical_field_label(p_field_name, captures[1]);
      if safe_label is not null
         and public.finance_normalize_critical_field_value(p_field_name, captures[2]) = corrected_value then
        template_type := 'same_line_label';
        configuration := pg_catalog.jsonb_build_object('type', template_type, 'label', safe_label);
        return next;
      end if;
    end if;

    safe_label := public.finance_safe_critical_field_label(
      p_field_name,
      pg_catalog.regexp_replace(pg_catalog.btrim(bounded_lines[line_number]), '[[:space:]]*[:-][[:space:]]*$', '')
    );
    if safe_label is null then
      continue;
    end if;
    non_empty_distance := 0;
    for next_line in line_number + 1..least(
      pg_catalog.cardinality(bounded_lines),
      line_number + 6
    ) loop
      if pg_catalog.btrim(bounded_lines[next_line]) = '' then
        continue;
      end if;
      non_empty_distance := non_empty_distance + 1;
      if public.finance_normalize_critical_field_value(p_field_name, bounded_lines[next_line]) = corrected_value then
        template_type := 'next_non_empty_line';
        configuration := pg_catalog.jsonb_build_object(
          'type', template_type,
          'label', safe_label,
          'max_lines', non_empty_distance
        );
        return next;
      end if;
      exit when non_empty_distance >= 3;
    end loop;
  end loop;
end;
$function$;

create function public.finance_apply_critical_field_template(
  p_configuration jsonb,
  p_field_name text,
  p_ocr_text text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  bounded_lines text[];
  line_number integer;
  next_line integer;
  non_empty_distance integer;
  label_value text;
  line_value text;
  remainder text;
  normalized_output text;
begin
  if p_field_name not in ('reference_number', 'merchant', 'transaction_date')
     or not public.finance_parser_template_configuration_is_valid(p_configuration)
     or p_configuration ->> 'type' not in ('same_line_label', 'next_non_empty_line') then
    return null;
  end if;
  label_value := pg_catalog.lower(pg_catalog.btrim(p_configuration ->> 'label'));
  bounded_lines := pg_catalog.regexp_split_to_array(
    pg_catalog.left(coalesce(p_ocr_text, ''), 20000),
    E'\r?\n'
  );
  if coalesce(pg_catalog.cardinality(bounded_lines), 0) = 0 then
    return null;
  end if;

  for line_number in 1..least(200, pg_catalog.cardinality(bounded_lines)) loop
    line_value := pg_catalog.btrim(bounded_lines[line_number]);
    if p_configuration ->> 'type' = 'same_line_label' then
      if not pg_catalog.starts_with(pg_catalog.lower(line_value), label_value) then
        continue;
      end if;
      remainder := pg_catalog.substr(line_value, pg_catalog.char_length(label_value) + 1);
      if remainder !~ '^(?:[[:space:]]*[:-][[:space:]]*|[[:space:]]+)' then
        continue;
      end if;
      remainder := pg_catalog.regexp_replace(remainder, '^[[:space:]]*[:-]?[[:space:]]*', '');
      return public.finance_normalize_critical_field_value(p_field_name, remainder);
    end if;

    if pg_catalog.lower(pg_catalog.regexp_replace(line_value, '[[:space:]]*[:-][[:space:]]*$', '')) <> label_value then
      continue;
    end if;
    non_empty_distance := 0;
    for next_line in line_number + 1..least(
      pg_catalog.cardinality(bounded_lines),
      line_number + 6
    ) loop
      if pg_catalog.btrim(bounded_lines[next_line]) = '' then
        continue;
      end if;
      non_empty_distance := non_empty_distance + 1;
      if non_empty_distance > (p_configuration ->> 'max_lines')::integer then
        exit;
      end if;
      normalized_output := public.finance_normalize_critical_field_value(
        p_field_name,
        bounded_lines[next_line]
      );
      if normalized_output is not null then
        return normalized_output;
      end if;
      exit when non_empty_distance >= (p_configuration ->> 'max_lines')::integer;
    end loop;
  end loop;
  return null;
end;
$function$;

create index finance_corrections_critical_field_learning_idx
  on public.finance_corrections(user_id, field_name, transaction_id, created_at desc, id desc)
  where field_name in ('reference_number', 'merchant', 'transaction_date')
    and transaction_id is not null
    and intake_item_id is not null;

create function public.finance_refresh_critical_field_templates_v1(p_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  proposed_count integer := 0;
  shadowed_count integer := 0;
  disabled_count integer := 0;
  rejected_count integer := 0;
begin
  if p_run_id is null or not exists (
    select 1 from public.finance_learning_runs runs where runs.id = p_run_id
  ) then
    raise exception using errcode = '22023', message = 'A valid learning run is required';
  end if;

  with latest_corrections as materialized (
    select distinct on (corrections.user_id, corrections.transaction_id, corrections.field_name)
      corrections.id,
      corrections.user_id,
      corrections.transaction_id,
      corrections.intake_item_id,
      corrections.field_name,
      corrections.corrected_value #>> '{}' as corrected_value,
      transactions.source_id,
      case corrections.field_name
        when 'reference_number' then transactions.reference_number
        when 'merchant' then transactions.merchant
        when 'transaction_date' then transactions.transaction_date::text
      end as confirmed_value,
      intakes.ocr_normalized_text
    from public.finance_corrections corrections
    join public.finance_transactions transactions
      on transactions.id = corrections.transaction_id
     and transactions.user_id = corrections.user_id
     and transactions.status = 'confirmed'
    join public.finance_intake_items intakes
      on intakes.id = corrections.intake_item_id
     and intakes.user_id = corrections.user_id
    join public.dim_finance_sources sources
      on sources.id = transactions.source_id
     and sources.user_id = transactions.user_id
     and sources.is_archived = false
    where corrections.field_name in ('reference_number', 'merchant', 'transaction_date')
      and corrections.transaction_id is not null
      and corrections.intake_item_id is not null
      and pg_catalog.jsonb_typeof(corrections.corrected_value) = 'string'
      and intakes.ocr_normalized_text is not null
    order by corrections.user_id, corrections.transaction_id, corrections.field_name,
      corrections.created_at desc, corrections.id desc
  ), extracted as materialized (
    select distinct
      corrections.user_id,
      corrections.source_id,
      corrections.field_name,
      corrections.transaction_id,
      candidates.template_type,
      candidates.configuration
    from latest_corrections corrections
    cross join lateral public.finance_critical_field_candidate_configurations(
      corrections.ocr_normalized_text,
      corrections.field_name,
      corrections.corrected_value
    ) candidates
    where public.finance_normalize_critical_field_value(
      corrections.field_name,
      corrections.corrected_value
    ) = public.finance_normalize_critical_field_value(
      corrections.field_name,
      corrections.confirmed_value
    )
  ), aggregated as materialized (
    select
      extracted.user_id,
      extracted.source_id,
      extracted.field_name,
      extracted.template_type,
      extracted.configuration,
      pg_catalog.count(distinct extracted.transaction_id)::integer as supporting_transactions
    from extracted
    group by extracted.user_id, extracted.source_id, extracted.field_name,
      extracted.template_type, extracted.configuration
    having pg_catalog.count(distinct extracted.transaction_id) >= 3
  ), bounded as materialized (
    select aggregated.*,
      pg_catalog.row_number() over (
        partition by aggregated.user_id, aggregated.source_id, aggregated.field_name
        order by aggregated.supporting_transactions desc,
          aggregated.template_type, aggregated.configuration::text
      ) as candidate_rank
    from aggregated
  )
  insert into public.finance_parser_templates (
    user_id, template_key, target_source_id, scope_source_id, field_name,
    template_type, configuration, algorithm_version, template_version, status
  )
  select
    bounded.user_id,
    'field:' || pg_catalog.md5(
      bounded.source_id::text || ':' || bounded.field_name || ':' ||
      bounded.template_type || ':' || bounded.configuration::text
    ),
    null,
    bounded.source_id,
    bounded.field_name,
    bounded.template_type,
    bounded.configuration,
    1,
    1,
    'proposed'
  from bounded
  where bounded.candidate_rank <= 20
  on conflict (user_id, template_key, algorithm_version, template_version) do nothing;
  get diagnostics proposed_count = row_count;

  with reviewed as materialized (
    select
      candidates.id as candidate_id,
      candidates.user_id,
      candidates.intake_item_id,
      candidates.payload,
      candidates.created_at as candidate_created_at,
      transactions.source_id,
      transactions.reference_number,
      transactions.merchant,
      transactions.transaction_date::text as transaction_date,
      intakes.ocr_normalized_text
    from public.finance_candidate_transactions candidates
    join public.finance_transactions transactions
      on transactions.id = candidates.confirmed_transaction_id
     and transactions.user_id = candidates.user_id
     and transactions.status = 'confirmed'
    join public.finance_intake_items intakes
      on intakes.id = candidates.intake_item_id
     and intakes.user_id = candidates.user_id
    where candidates.status = 'accepted'
      and transactions.source_id is not null
      and intakes.ocr_normalized_text is not null
  ), evaluations as materialized (
    select
      templates.id as template_id,
      templates.user_id,
      templates.algorithm_version,
      templates.field_name,
      reviewed.candidate_id,
      reviewed.intake_item_id,
      reviewed.candidate_created_at,
      extracted.value as extracted_value,
      case templates.field_name
        when 'reference_number' then reviewed.reference_number
        when 'merchant' then reviewed.merchant
        when 'transaction_date' then reviewed.transaction_date
      end as confirmed_value,
      trace.outcome as trace_outcome,
      correction.id as correction_id
    from public.finance_parser_templates templates
    join reviewed
      on reviewed.user_id = templates.user_id
     and reviewed.source_id = templates.scope_source_id
    cross join lateral (
      select public.finance_apply_critical_field_template(
        templates.configuration,
        templates.field_name,
        reviewed.ocr_normalized_text
      ) as value
    ) extracted
    left join lateral (
      select evaluation.value ->> 'outcome' as outcome
      from pg_catalog.jsonb_array_elements(
        coalesce(reviewed.payload -> 'parser_template_evaluations', '[]'::jsonb)
      ) evaluation(value)
      where evaluation.value ->> 'template_id' = templates.id::text
      limit 1
    ) trace on true
    left join lateral (
      select corrections.id
      from public.finance_corrections corrections
      where corrections.user_id = reviewed.user_id
        and corrections.intake_item_id = reviewed.intake_item_id
        and corrections.field_name = templates.field_name
      order by corrections.created_at desc, corrections.id desc
      limit 1
    ) correction on true
    where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
      and templates.template_type in ('same_line_label', 'next_non_empty_line')
      and templates.algorithm_version = 1
      and (
        extracted.value is not null
        or trace.outcome = 'invalid_output'
      )
      and (
        templates.status = 'proposed'
        or reviewed.candidate_created_at <= coalesce(templates.evaluated_at, reviewed.candidate_created_at)
        or trace.outcome in ('shadow', 'applied', 'conflict', 'invalid_output')
      )
  )
  insert into public.finance_template_evidence (
    template_id, user_id, correction_id, candidate_id, intake_item_id,
    outcome, algorithm_version
  )
  select
    evaluations.template_id,
    evaluations.user_id,
    evaluations.correction_id,
    evaluations.candidate_id,
    evaluations.intake_item_id,
    case
      when evaluations.trace_outcome = 'invalid_output' then 'invalid_output'
      when evaluations.extracted_value = public.finance_normalize_critical_field_value(
        evaluations.field_name,
        evaluations.confirmed_value
      ) then 'supported'
      else 'contradicted'
    end,
    evaluations.algorithm_version
  from evaluations
  on conflict (template_id, candidate_id) where candidate_id is not null
  do update set
    correction_id = excluded.correction_id,
    intake_item_id = excluded.intake_item_id,
    outcome = excluded.outcome,
    algorithm_version = excluded.algorithm_version;

  with reviewed_totals as materialized (
    select
      transactions.user_id,
      transactions.source_id,
      pg_catalog.count(*)::integer as reviewed_count
    from public.finance_transactions transactions
    join public.finance_candidate_transactions candidates
      on candidates.confirmed_transaction_id = transactions.id
     and candidates.user_id = transactions.user_id
     and candidates.status = 'accepted'
    where transactions.status = 'confirmed'
      and transactions.source_id is not null
    group by transactions.user_id, transactions.source_id
  ), metrics as materialized (
    select
      templates.id,
      templates.user_id,
      pg_catalog.count(*) filter (where evidence.outcome = 'supported')::integer as support_count,
      pg_catalog.count(*) filter (
        where evidence.outcome in ('contradicted', 'invalid_output')
      )::integer as contradiction_count,
      pg_catalog.count(*) filter (
        where evidence.outcome in ('supported', 'contradicted', 'invalid_output')
      )::integer as evaluation_count,
      pg_catalog.max(reviewed_totals.reviewed_count) as reviewed_count
    from public.finance_parser_templates templates
    left join public.finance_template_evidence evidence
      on evidence.template_id = templates.id
     and evidence.user_id = templates.user_id
     and evidence.algorithm_version = templates.algorithm_version
    left join reviewed_totals
      on reviewed_totals.user_id = templates.user_id
     and reviewed_totals.source_id = templates.scope_source_id
    where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
      and templates.algorithm_version = 1
    group by templates.id, templates.user_id
  )
  update public.finance_parser_templates templates
  set evidence_count = metrics.support_count,
      contradiction_count = metrics.contradiction_count,
      evaluation_count = metrics.evaluation_count,
      precision = metrics.support_count::numeric / nullif(metrics.evaluation_count, 0),
      coverage = metrics.evaluation_count::numeric / nullif(metrics.reviewed_count, 0),
      evaluated_at = case
        when metrics.evaluation_count > 0 then coalesce(templates.evaluated_at, pg_catalog.clock_timestamp())
        else templates.evaluated_at
      end
  from metrics
  where templates.id = metrics.id
    and templates.user_id = metrics.user_id
    and row(
      templates.evidence_count, templates.contradiction_count, templates.evaluation_count,
      templates.precision, templates.coverage
    ) is distinct from row(
      metrics.support_count, metrics.contradiction_count, metrics.evaluation_count,
      metrics.support_count::numeric / nullif(metrics.evaluation_count, 0),
      metrics.evaluation_count::numeric / nullif(metrics.reviewed_count, 0)
    );

  update public.finance_parser_templates templates
  set status = 'disabled', status_reason = 'contradiction'
  where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
    and templates.status = 'active'
    and templates.contradiction_count > 0;
  get diagnostics disabled_count = row_count;

  update public.finance_parser_templates templates
  set status = 'rejected', status_reason = 'contradiction'
  where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
    and templates.status in ('proposed', 'shadow')
    and templates.contradiction_count > 0;
  get diagnostics rejected_count = row_count;

  with reviewed_totals as materialized (
    select transactions.user_id, transactions.source_id, pg_catalog.count(*)::integer as reviewed_count
    from public.finance_transactions transactions
    join public.finance_candidate_transactions candidates
      on candidates.confirmed_transaction_id = transactions.id
     and candidates.user_id = transactions.user_id
     and candidates.status = 'accepted'
    where transactions.status = 'confirmed' and transactions.source_id is not null
    group by transactions.user_id, transactions.source_id
  ), eligible as materialized (
    select
      templates.id,
      templates.user_id,
      pg_catalog.row_number() over (
        partition by templates.user_id, templates.scope_source_id, templates.field_name
        order by templates.precision desc nulls last, templates.evidence_count desc,
          templates.evaluation_count desc, templates.created_at, templates.id
      ) as promotion_rank,
      (
        select pg_catalog.count(*)::integer
        from public.finance_parser_templates runtime_templates
        where runtime_templates.user_id = templates.user_id
          and runtime_templates.scope_source_id = templates.scope_source_id
          and runtime_templates.field_name = templates.field_name
          and runtime_templates.status in ('shadow', 'active')
      ) as runtime_count
    from public.finance_parser_templates templates
    join public.dim_finance_sources sources
      on sources.id = templates.scope_source_id
     and sources.user_id = templates.user_id
     and sources.is_archived = false
    join reviewed_totals
      on reviewed_totals.user_id = templates.user_id
     and reviewed_totals.source_id = templates.scope_source_id
    where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
      and templates.status = 'proposed'
      and templates.evidence_count >= 3
      and templates.evaluation_count >= least(5, reviewed_totals.reviewed_count)
      and templates.contradiction_count = 0
      and templates.precision = 1::numeric
  )
  update public.finance_parser_templates templates
  set status = 'shadow', status_reason = null
  from eligible
  where templates.id = eligible.id
    and templates.user_id = eligible.user_id
    and eligible.promotion_rank <= greatest(0, 20 - eligible.runtime_count);
  get diagnostics shadowed_count = row_count;

  with latest_corrections as materialized (
    select distinct on (corrections.user_id, corrections.transaction_id, corrections.field_name)
      corrections.user_id,
      corrections.transaction_id,
      corrections.field_name
    from public.finance_corrections corrections
    where corrections.field_name in ('reference_number', 'merchant', 'transaction_date')
      and corrections.transaction_id is not null
    order by corrections.user_id, corrections.transaction_id, corrections.field_name,
      corrections.created_at desc, corrections.id desc
  ), affected_users as materialized (
    select latest_corrections.user_id from latest_corrections
    union
    select templates.user_id from public.finance_parser_templates templates
    where templates.field_name in ('reference_number', 'merchant', 'transaction_date')
  ), outcomes as materialized (
    select
      affected_users.user_id,
      (select pg_catalog.count(*)::integer from latest_corrections
       where latest_corrections.user_id = affected_users.user_id) as corrections_examined,
      (select pg_catalog.count(*)::integer from public.finance_parser_templates templates
       where templates.user_id = affected_users.user_id
         and templates.field_name in ('reference_number', 'merchant', 'transaction_date')
         and templates.status = 'proposed' and templates.evidence_count < 3) as insufficient_count,
      (select pg_catalog.count(*)::integer from public.finance_parser_templates templates
       where templates.user_id = affected_users.user_id
         and templates.field_name in ('reference_number', 'merchant', 'transaction_date')
         and templates.status in ('rejected', 'disabled')
         and templates.status_reason = 'contradiction') as contradiction_count,
      (select pg_catalog.count(*)::integer from public.finance_template_evidence evidence
       join public.finance_parser_templates templates on templates.id = evidence.template_id
       where templates.user_id = affected_users.user_id
         and templates.field_name in ('reference_number', 'merchant', 'transaction_date')
         and evidence.outcome = 'invalid_output') as invalid_output_count
    from affected_users
  )
  insert into public.finance_learning_run_user_summaries (
    run_id, user_id, corrections_examined, reason_counts
  )
  select
    p_run_id,
    outcomes.user_id,
    outcomes.corrections_examined,
    pg_catalog.jsonb_build_object(
      'insufficient_evidence', outcomes.insufficient_count,
      'contradiction', outcomes.contradiction_count,
      'invalid_output', outcomes.invalid_output_count
    )
  from outcomes
  on conflict (run_id, user_id) do update
  set corrections_examined = public.finance_learning_run_user_summaries.corrections_examined
        + excluded.corrections_examined,
      reason_counts = pg_catalog.jsonb_build_object(
        'insufficient_evidence',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'insufficient_evidence')::integer, 0)
          + coalesce((excluded.reason_counts ->> 'insufficient_evidence')::integer, 0),
        'contradiction',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'contradiction')::integer, 0)
          + coalesce((excluded.reason_counts ->> 'contradiction')::integer, 0),
        'invalid_output',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'invalid_output')::integer, 0)
          + coalesce((excluded.reason_counts ->> 'invalid_output')::integer, 0),
        'unresolved_missing_context',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'unresolved_missing_context')::integer, 0),
        'source_archived',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'source_archived')::integer, 0),
        'conflict',
          coalesce((public.finance_learning_run_user_summaries.reason_counts ->> 'conflict')::integer, 0)
      );

  return pg_catalog.jsonb_build_object(
    'proposed', proposed_count,
    'shadowed', shadowed_count,
    'disabled', disabled_count,
    'rejected', rejected_count
  );
end;
$function$;

alter function public.finance_refresh_rule_suggestions(uuid)
  rename to finance_refresh_rule_suggestions_phase_two_v1;

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
  field_result jsonb;
  legacy_inserted_rows integer := 0;
  failure_sqlstate text;
  safe_failure_code text;
begin
  if p_invocation_id is null then
    raise exception using errcode = '22023', message = 'Learning invocation ID is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_refresh_rule_suggestions', 1)
  );
  select * into run_row from public.finance_learning_runs runs
  where runs.invocation_id = p_invocation_id;
  if run_row.critical_field_learning_completed_at is not null or run_row.status = 'failed' then
    return coalesce(run_row.legacy_inserted_count, 0);
  end if;

  legacy_inserted_rows := public.finance_refresh_rule_suggestions_phase_two_v1(p_invocation_id);
  select * into run_row from public.finance_learning_runs runs
  where runs.invocation_id = p_invocation_id;
  if run_row.id is null or run_row.status = 'failed' then
    return 0;
  end if;

  begin
    field_result := public.finance_refresh_critical_field_templates_v1(run_row.id);
    update public.finance_learning_runs runs
    set status = 'succeeded',
        finished_at = pg_catalog.clock_timestamp(),
        corrections_examined = (
          select coalesce(pg_catalog.sum(summaries.corrections_examined), 0)::integer
          from public.finance_learning_run_user_summaries summaries
          where summaries.run_id = run_row.id
        ),
        templates_proposed = runs.templates_proposed
          + coalesce((field_result ->> 'proposed')::integer, 0),
        templates_shadowed = runs.templates_shadowed
          + coalesce((field_result ->> 'shadowed')::integer, 0),
        templates_disabled = runs.templates_disabled
          + coalesce((field_result ->> 'disabled')::integer, 0),
        templates_rejected = runs.templates_rejected
          + coalesce((field_result ->> 'rejected')::integer, 0),
        reason_counts = (
          select pg_catalog.jsonb_build_object(
            'insufficient_evidence', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'insufficient_evidence')::integer
            ), 0),
            'contradiction', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'contradiction')::integer
            ), 0),
            'invalid_output', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'invalid_output')::integer
            ), 0),
            'unresolved_missing_context', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'unresolved_missing_context')::integer
            ), 0),
            'source_archived', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'source_archived')::integer
            ), 0),
            'conflict', coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'conflict')::integer
            ), 0)
          )
          from public.finance_learning_run_user_summaries summaries
          where summaries.run_id = run_row.id
        ),
        failure_stage = null,
        failure_code = null,
        critical_field_learning_completed_at = pg_catalog.clock_timestamp()
    where runs.id = run_row.id;
    return legacy_inserted_rows;
  exception
    when others then
      get stacked diagnostics failure_sqlstate = returned_sqlstate;
      safe_failure_code := case
        when failure_sqlstate = '57014' then 'database_timeout'
        when failure_sqlstate in ('40001', '40P01') then 'database_retryable'
        when failure_sqlstate like '23%' then 'database_constraint'
        else 'critical_field_learning_failed'
      end;
      update public.finance_learning_runs runs
      set status = 'failed',
          finished_at = pg_catalog.clock_timestamp(),
          failure_stage = 'critical_field_template_refresh',
          failure_code = safe_failure_code
      where runs.id = run_row.id;
      return 0;
  end;
end;
$function$;

comment on column public.finance_learning_runs.critical_field_learning_completed_at is
  'Idempotency marker showing that Phase 3 critical-field template learning completed for this invocation.';
comment on function public.finance_critical_field_candidate_configurations(text, text, text) is
  'Extracts allowlisted privacy-safe structural candidates for critical OCR fields.';
comment on function public.finance_apply_critical_field_template(jsonb, text, text) is
  'Evaluates a validated critical-field template without executing user-provided code or regular expressions.';
comment on function public.finance_refresh_critical_field_templates_v1(uuid) is
  'Generates, backtests, shadows, and reevaluates source-scoped critical-field templates without activating them.';
comment on function public.finance_refresh_rule_suggestions(uuid) is
  'Cron-compatible observable learning entry point for legacy rules and Phase 2 and Phase 3 OCR templates.';

revoke execute on function public.finance_normalize_critical_field_value(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_safe_critical_field_label(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_critical_field_candidate_configurations(text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_apply_critical_field_template(jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_critical_field_templates_v1(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions_phase_two_v1(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
