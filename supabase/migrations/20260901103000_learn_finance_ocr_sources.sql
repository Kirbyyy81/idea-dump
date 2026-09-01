alter table public.finance_learning_runs
  add column source_learning_completed_at timestamp with time zone;

create function public.finance_normalize_source_phrase(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select pg_catalog.nullif(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.coalesce(p_value, '')), '_', ' ', 'g'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$function$;

create function public.finance_safe_source_candidate_phrase(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  normalized_phrase text;
begin
  normalized_phrase := public.finance_normalize_source_phrase(
    pg_catalog.regexp_replace(pg_catalog.coalesce(p_value, ''), '[0-9]+([.,:/-][0-9]+)*', ' ', 'g')
  );
  if normalized_phrase is null
     or pg_catalog.char_length(normalized_phrase) not between 3 and 120
     or normalized_phrase !~ '[[:alpha:]]'
     or normalized_phrase ~ '[0-9]'
     or normalized_phrase ~ '(^| )(amount|balance|reference|ref|account|recipient|date|time|notes?|transaction id|order id)( |$)' then
    return null;
  end if;
  return normalized_phrase;
end;
$function$;

create function public.finance_source_candidate_phrases(
  p_ocr_text text,
  p_original_filename text
)
returns table(phrase text, location text)
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  bounded_lines text[];
  line_count integer;
  line_number integer;
  safe_phrase text;
  filename_tokens text[];
  token_number integer;
  token_window integer;
  token_phrase text;
begin
  safe_phrase := public.finance_safe_source_candidate_phrase(
    pg_catalog.regexp_replace(pg_catalog.coalesce(p_original_filename, ''), '\.[^.]+$', '')
  );
  if safe_phrase is not null then
    phrase := safe_phrase;
    location := 'filename';
    return next;
    filename_tokens := pg_catalog.regexp_split_to_array(safe_phrase, ' +');
    if pg_catalog.cardinality(filename_tokens) > 1 then
      for token_number in 1..pg_catalog.cardinality(filename_tokens) loop
        for token_window in 1..pg_catalog.least(3, pg_catalog.cardinality(filename_tokens) - token_number + 1) loop
          token_phrase := pg_catalog.array_to_string(
            filename_tokens[token_number:token_number + token_window - 1],
            ' '
          );
          if pg_catalog.char_length(token_phrase) >= 3
             and token_phrase not in ('screenshot', 'image', 'img', 'camera', 'photo', 'png', 'jpg', 'jpeg') then
            phrase := token_phrase;
            return next;
          end if;
        end loop;
      end loop;
    end if;
  end if;

  select pg_catalog.array_agg(lines.value order by lines.ordinality)
  into bounded_lines
  from pg_catalog.unnest(pg_catalog.regexp_split_to_array(
    pg_catalog.left(pg_catalog.coalesce(p_ocr_text, ''), 20000),
    E'\\r?\\n'
  )) with ordinality lines(value, ordinality)
  where lines.ordinality <= 200
    and public.finance_normalize_source_phrase(lines.value) is not null;
  line_count := pg_catalog.coalesce(pg_catalog.cardinality(bounded_lines), 0);
  if line_count = 0 then
    return;
  end if;

  for line_number in 1..line_count loop
    safe_phrase := public.finance_safe_source_candidate_phrase(bounded_lines[line_number]);
    if safe_phrase is null then
      continue;
    end if;

    phrase := safe_phrase;
    location := 'ocr_line';
    return next;
    if line_number <= 3 then
      location := 'header';
      return next;
    end if;
    if line_number > line_count - 3 then
      location := 'footer';
      return next;
    end if;
  end loop;
end;
$function$;

create function public.finance_source_phrase_matches(
  p_configuration jsonb,
  p_ocr_text text,
  p_original_filename text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  normalized_phrase text;
  normalized_filename text;
  bounded_lines text[];
  line_count integer;
  first_line integer;
  last_line integer;
  line_number integer;
begin
  if not public.finance_parser_template_configuration_is_valid(p_configuration)
     or p_configuration ->> 'type' <> 'source_phrase' then
    return false;
  end if;

  normalized_phrase := public.finance_normalize_source_phrase(p_configuration ->> 'phrase');
  if normalized_phrase is null or pg_catalog.char_length(normalized_phrase) < 3 then
    return false;
  end if;

  if p_configuration ->> 'location' = 'filename' then
    normalized_filename := public.finance_normalize_source_phrase(p_original_filename);
    return (' ' || pg_catalog.coalesce(normalized_filename, '') || ' ')
      like ('% ' || normalized_phrase || ' %');
  end if;

  select pg_catalog.array_agg(lines.value order by lines.ordinality)
  into bounded_lines
  from pg_catalog.unnest(pg_catalog.regexp_split_to_array(
    pg_catalog.left(pg_catalog.coalesce(p_ocr_text, ''), 20000),
    E'\\r?\\n'
  )) with ordinality lines(value, ordinality)
  where lines.ordinality <= 200
    and public.finance_normalize_source_phrase(lines.value) is not null;
  line_count := pg_catalog.coalesce(pg_catalog.cardinality(bounded_lines), 0);
  if line_count = 0 then
    return false;
  end if;

  if p_configuration ->> 'location' = 'header' then
    first_line := 1;
    last_line := pg_catalog.least(3, line_count);
  elsif p_configuration ->> 'location' = 'footer' then
    first_line := pg_catalog.greatest(1, line_count - 2);
    last_line := line_count;
  else
    first_line := 1;
    last_line := line_count;
  end if;

  for line_number in first_line..last_line loop
    if (' ' || pg_catalog.coalesce(public.finance_normalize_source_phrase(bounded_lines[line_number]), '') || ' ')
       like ('% ' || normalized_phrase || ' %') then
      return true;
    end if;
  end loop;
  return false;
end;
$function$;

create index finance_corrections_source_learning_idx
  on public.finance_corrections(user_id, transaction_id, created_at desc, id desc)
  where field_name = 'source_id' and transaction_id is not null and intake_item_id is not null;

create index finance_candidates_confirmed_learning_idx
  on public.finance_candidate_transactions(user_id, confirmed_transaction_id, intake_item_id)
  where status = 'accepted' and confirmed_transaction_id is not null;

create function public.finance_refresh_source_templates_v1(p_run_id uuid)
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

  with source_corrections as materialized (
    select distinct on (corrections.user_id, corrections.transaction_id)
      corrections.id,
      corrections.user_id,
      corrections.transaction_id,
      corrections.intake_item_id,
      case
        when corrections.corrected_value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (corrections.corrected_value #>> '{}')::uuid
        else null
      end as target_source_id,
      intakes.ocr_normalized_text,
      intakes.original_filename
    from public.finance_corrections corrections
    join public.finance_transactions transactions
      on transactions.id = corrections.transaction_id
     and transactions.user_id = corrections.user_id
     and transactions.status = 'confirmed'
    join public.finance_intake_items intakes
      on intakes.id = corrections.intake_item_id
     and intakes.user_id = corrections.user_id
    where corrections.field_name = 'source_id'
      and corrections.transaction_id is not null
      and corrections.intake_item_id is not null
      and pg_catalog.jsonb_typeof(corrections.corrected_value) = 'string'
    order by corrections.user_id, corrections.transaction_id, corrections.created_at desc, corrections.id desc
  ), valid_corrections as materialized (
    select source_corrections.*
    from source_corrections
    join public.dim_finance_sources sources
      on sources.id = source_corrections.target_source_id
     and sources.user_id = source_corrections.user_id
     and sources.is_archived = false
    where source_corrections.target_source_id is not null
      and source_corrections.ocr_normalized_text is not null
  ), extracted as materialized (
    select distinct
      corrections.user_id,
      corrections.target_source_id,
      corrections.transaction_id,
      phrases.phrase,
      phrases.location
    from valid_corrections corrections
    cross join lateral public.finance_source_candidate_phrases(
      corrections.ocr_normalized_text,
      corrections.original_filename
    ) phrases
    union
    select distinct
      corrections.user_id,
      corrections.target_source_id,
      corrections.transaction_id,
      public.finance_safe_source_candidate_phrase(aliases.alias),
      aliases.location
    from valid_corrections corrections
    join public.dim_finance_sources sources
      on sources.id = corrections.target_source_id
     and sources.user_id = corrections.user_id
    cross join lateral (
      select filename_aliases.alias, 'filename'::text as location
      from pg_catalog.unnest(sources.filename_aliases) filename_aliases(alias)
      union all
      select ocr_aliases.alias, 'ocr_line'::text as location
      from pg_catalog.unnest(sources.ocr_aliases) ocr_aliases(alias)
      union all
      select sources.name, 'filename'::text
      union all
      select sources.name, 'ocr_line'::text
    ) aliases
    where public.finance_safe_source_candidate_phrase(aliases.alias) is not null
      and public.finance_source_phrase_matches(
        pg_catalog.jsonb_build_object(
          'type', 'source_phrase',
          'phrase', public.finance_safe_source_candidate_phrase(aliases.alias),
          'location', aliases.location
        ),
        corrections.ocr_normalized_text,
        corrections.original_filename
      )
  ), aggregated as materialized (
    select
      extracted.user_id,
      extracted.target_source_id,
      extracted.phrase,
      extracted.location,
      pg_catalog.count(distinct extracted.transaction_id)::integer as supporting_transactions
    from extracted
    where extracted.phrase is not null
    group by extracted.user_id, extracted.target_source_id, extracted.phrase, extracted.location
    having pg_catalog.count(distinct extracted.transaction_id) >= 3
  ), bounded as materialized (
    select
      aggregated.*,
      pg_catalog.row_number() over (
        partition by aggregated.user_id, aggregated.target_source_id
        order by
          aggregated.supporting_transactions desc,
          pg_catalog.char_length(aggregated.phrase) desc,
          aggregated.location,
          aggregated.phrase
      ) as candidate_rank
    from aggregated
  )
  insert into public.finance_parser_templates (
    user_id,
    template_key,
    target_source_id,
    scope_source_id,
    field_name,
    template_type,
    configuration,
    algorithm_version,
    template_version,
    status
  )
  select
    bounded.user_id,
    'source_phrase:' || pg_catalog.md5(
      bounded.target_source_id::text || ':' || bounded.location || ':' || bounded.phrase
    ),
    bounded.target_source_id,
    null,
    'source_id',
    'source_phrase',
    pg_catalog.jsonb_build_object(
      'type', 'source_phrase',
      'phrase', bounded.phrase,
      'location', bounded.location
    ),
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
      transactions.source_id as confirmed_source_id,
      intakes.ocr_normalized_text,
      intakes.original_filename,
      intakes.source_detection_signals,
      candidates.created_at as candidate_created_at,
      source_correction.id as correction_id
    from public.finance_candidate_transactions candidates
    join public.finance_transactions transactions
      on transactions.id = candidates.confirmed_transaction_id
     and transactions.user_id = candidates.user_id
     and transactions.status = 'confirmed'
    join public.finance_intake_items intakes
      on intakes.id = candidates.intake_item_id
     and intakes.user_id = candidates.user_id
    left join lateral (
      select corrections.id
      from public.finance_corrections corrections
      where corrections.user_id = candidates.user_id
        and corrections.transaction_id = transactions.id
        and corrections.field_name = 'source_id'
      order by corrections.created_at desc, corrections.id desc
      limit 1
    ) source_correction on true
    where candidates.status = 'accepted'
      and transactions.source_id is not null
      and intakes.ocr_normalized_text is not null
  )
  insert into public.finance_template_evidence (
    template_id,
    user_id,
    correction_id,
    candidate_id,
    intake_item_id,
    outcome,
    algorithm_version
  )
  select
    templates.id,
    templates.user_id,
    reviewed.correction_id,
    reviewed.candidate_id,
    reviewed.intake_item_id,
    case
      when templates.target_source_id = reviewed.confirmed_source_id then 'supported'
      else 'contradicted'
    end,
    1
  from public.finance_parser_templates templates
  join reviewed on reviewed.user_id = templates.user_id
  where templates.field_name = 'source_id'
    and templates.template_type = 'source_phrase'
    and templates.algorithm_version = 1
    and public.finance_source_phrase_matches(
      templates.configuration,
      reviewed.ocr_normalized_text,
      reviewed.original_filename
    )
    and (
      templates.status = 'proposed'
      or reviewed.candidate_created_at <= pg_catalog.coalesce(templates.evaluated_at, reviewed.candidate_created_at)
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(reviewed.source_detection_signals) signals(value)
        where signals.value ->> 'template_id' = templates.id::text
          and signals.value ->> 'kind' in ('learned_source_shadow', 'learned_source_active')
      )
    )
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
      pg_catalog.count(*) filter (where evidence.outcome = 'contradicted')::integer as contradiction_count,
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
     and reviewed_totals.source_id = templates.target_source_id
    where templates.field_name = 'source_id'
      and templates.algorithm_version = 1
    group by templates.id, templates.user_id
  )
  update public.finance_parser_templates templates
  set evidence_count = metrics.support_count,
      contradiction_count = metrics.contradiction_count,
      evaluation_count = metrics.evaluation_count,
      precision = metrics.support_count::numeric
        / pg_catalog.nullif(metrics.support_count + metrics.contradiction_count, 0),
      coverage = metrics.support_count::numeric / pg_catalog.nullif(metrics.reviewed_count, 0),
      evaluated_at = case
        when metrics.evaluation_count > 0 then pg_catalog.coalesce(templates.evaluated_at, pg_catalog.clock_timestamp())
        else templates.evaluated_at
      end
  from metrics
  where templates.id = metrics.id
    and templates.user_id = metrics.user_id
    and row(
      templates.evidence_count,
      templates.contradiction_count,
      templates.evaluation_count,
      templates.precision,
      templates.coverage
    ) is distinct from row(
      metrics.support_count,
      metrics.contradiction_count,
      metrics.evaluation_count,
      metrics.support_count::numeric / pg_catalog.nullif(metrics.support_count + metrics.contradiction_count, 0),
      metrics.support_count::numeric / pg_catalog.nullif(metrics.reviewed_count, 0)
    );

  update public.finance_parser_templates templates
  set status = 'disabled',
      status_reason = case
        when sources.is_archived then 'source_archived'
        else 'contradiction'
      end
  from public.dim_finance_sources sources
  where templates.target_source_id = sources.id
    and templates.user_id = sources.user_id
    and templates.field_name = 'source_id'
    and templates.status = 'active'
    and (sources.is_archived or templates.contradiction_count > 0);
  get diagnostics disabled_count = row_count;

  update public.finance_parser_templates templates
  set status = 'rejected',
      status_reason = case
        when sources.is_archived then 'source_archived'
        else 'contradiction'
      end
  from public.dim_finance_sources sources
  where templates.target_source_id = sources.id
    and templates.user_id = sources.user_id
    and templates.field_name = 'source_id'
    and templates.status in ('proposed', 'shadow')
    and (sources.is_archived or templates.contradiction_count > 0);
  get diagnostics rejected_count = row_count;

  with eligible as materialized (
    select
      templates.id,
      templates.user_id,
      templates.target_source_id,
      pg_catalog.row_number() over (
        partition by templates.user_id, templates.target_source_id
        order by
          templates.precision desc nulls last,
          templates.evidence_count desc,
          templates.evaluation_count desc,
          templates.created_at,
          templates.id
      ) as promotion_rank,
      (
        select pg_catalog.count(*)::integer
        from public.finance_parser_templates runtime_templates
        where runtime_templates.user_id = templates.user_id
          and runtime_templates.target_source_id = templates.target_source_id
          and runtime_templates.field_name = 'source_id'
          and runtime_templates.status in ('shadow', 'active')
      ) as runtime_count
    from public.finance_parser_templates templates
    join public.dim_finance_sources sources
      on sources.id = templates.target_source_id
     and sources.user_id = templates.user_id
     and sources.is_archived = false
    where templates.field_name = 'source_id'
      and templates.status = 'proposed'
      and templates.evidence_count >= 3
      and templates.contradiction_count = 0
      and templates.precision = 1::numeric
      and not exists (
        select 1
        from public.finance_parser_templates peers
        where peers.user_id = templates.user_id
          and peers.id <> templates.id
          and peers.field_name = 'source_id'
          and peers.status in ('shadow', 'active')
          and peers.target_source_id <> templates.target_source_id
          and peers.configuration = templates.configuration
      )
  )
  update public.finance_parser_templates templates
  set status = 'shadow',
      status_reason = null
  from eligible
  where templates.id = eligible.id
    and templates.user_id = eligible.user_id
    and eligible.promotion_rank <= 20 - eligible.runtime_count;
  get diagnostics shadowed_count = row_count;

  with source_corrections as materialized (
    select distinct on (corrections.user_id, corrections.transaction_id)
      corrections.user_id,
      corrections.transaction_id
    from public.finance_corrections corrections
    join public.finance_transactions transactions
      on transactions.id = corrections.transaction_id
     and transactions.user_id = corrections.user_id
     and transactions.status = 'confirmed'
    where corrections.field_name = 'source_id'
      and corrections.transaction_id is not null
    order by corrections.user_id, corrections.transaction_id, corrections.created_at desc, corrections.id desc
  ), affected_users as materialized (
    select source_corrections.user_id from source_corrections
    union
    select templates.user_id
    from public.finance_parser_templates templates
    where templates.field_name = 'source_id'
  ), outcomes as materialized (
    select
      affected_users.user_id,
      (
        select pg_catalog.count(*)::integer
        from source_corrections
        where source_corrections.user_id = affected_users.user_id
      ) as source_corrections_examined,
      (
        select pg_catalog.count(*)::integer
        from public.finance_parser_templates templates
        where templates.user_id = affected_users.user_id
          and templates.field_name = 'source_id'
          and templates.status = 'proposed'
          and templates.evidence_count < 3
      ) as insufficient_count,
      (
        select pg_catalog.count(*)::integer
        from public.finance_parser_templates templates
        where templates.user_id = affected_users.user_id
          and templates.field_name = 'source_id'
          and templates.status in ('rejected', 'disabled')
          and templates.status_reason = 'contradiction'
      ) as contradiction_count
    from affected_users
  )
  insert into public.finance_learning_run_user_summaries (
    run_id,
    user_id,
    corrections_examined,
    reason_counts
  )
  select
    p_run_id,
    outcomes.user_id,
    outcomes.source_corrections_examined,
    pg_catalog.jsonb_build_object(
      'insufficient_evidence', outcomes.insufficient_count,
      'contradiction', outcomes.contradiction_count
    )
  from outcomes
  on conflict (run_id, user_id) do update
  set corrections_examined = public.finance_learning_run_user_summaries.corrections_examined
        + excluded.corrections_examined,
      reason_counts = public.finance_learning_run_user_summaries.reason_counts || excluded.reason_counts;

  return pg_catalog.jsonb_build_object(
    'proposed', proposed_count,
    'shadowed', shadowed_count,
    'disabled', disabled_count,
    'rejected', rejected_count
  );
end;
$function$;

alter function public.finance_refresh_rule_suggestions(uuid)
  rename to finance_refresh_rule_suggestions_phase_one_v1;

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
  source_result jsonb;
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

  select * into run_row
  from public.finance_learning_runs runs
  where runs.invocation_id = p_invocation_id;

  if run_row.source_learning_completed_at is not null or run_row.status = 'failed' then
    return pg_catalog.coalesce(run_row.legacy_inserted_count, 0);
  end if;

  legacy_inserted_rows := public.finance_refresh_rule_suggestions_phase_one_v1(p_invocation_id);

  select * into run_row
  from public.finance_learning_runs runs
  where runs.invocation_id = p_invocation_id;

  if run_row.id is null or run_row.status = 'failed' then
    return 0;
  end if;

  begin
    source_result := public.finance_refresh_source_templates_v1(run_row.id);

    update public.finance_learning_runs runs
    set status = 'succeeded',
        finished_at = pg_catalog.clock_timestamp(),
        corrections_examined = (
          select pg_catalog.coalesce(pg_catalog.sum(summaries.corrections_examined), 0)::integer
          from public.finance_learning_run_user_summaries summaries
          where summaries.run_id = run_row.id
        ),
        templates_proposed = pg_catalog.coalesce((source_result ->> 'proposed')::integer, 0),
        templates_shadowed = pg_catalog.coalesce((source_result ->> 'shadowed')::integer, 0),
        templates_disabled = pg_catalog.coalesce((source_result ->> 'disabled')::integer, 0),
        templates_rejected = pg_catalog.coalesce((source_result ->> 'rejected')::integer, 0),
        reason_counts = (
          select pg_catalog.jsonb_build_object(
            'insufficient_evidence', pg_catalog.coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'insufficient_evidence')::integer
            ), 0),
            'contradiction', pg_catalog.coalesce(pg_catalog.sum(
              (summaries.reason_counts ->> 'contradiction')::integer
            ), 0)
          )
          from public.finance_learning_run_user_summaries summaries
          where summaries.run_id = run_row.id
        ),
        failure_stage = null,
        failure_code = null,
        source_learning_completed_at = pg_catalog.clock_timestamp()
    where runs.id = run_row.id;

    return legacy_inserted_rows;
  exception
    when others then
      get stacked diagnostics failure_sqlstate = returned_sqlstate;
      safe_failure_code := case
        when failure_sqlstate = '57014' then 'database_timeout'
        when failure_sqlstate in ('40001', '40P01') then 'database_retryable'
        when failure_sqlstate like '23%' then 'database_constraint'
        else 'source_learning_failed'
      end;

      update public.finance_learning_runs runs
      set status = 'failed',
          finished_at = pg_catalog.clock_timestamp(),
          failure_stage = 'source_template_refresh',
          failure_code = safe_failure_code
      where runs.id = run_row.id;
      return 0;
  end;
end;
$function$;

comment on column public.finance_learning_runs.source_learning_completed_at is
  'Idempotency marker showing that Phase 2 source-template learning completed for this invocation.';
comment on function public.finance_source_candidate_phrases(text, text) is
  'Extracts bounded privacy-safe filename and OCR-line phrases for source candidate generation.';
comment on function public.finance_source_phrase_matches(jsonb, text, text) is
  'Evaluates a validated source-phrase template against bounded normalized intake text.';
comment on function public.finance_refresh_source_templates_v1(uuid) is
  'Generates, backtests, shadows, and reevaluates user-owned source templates without activating them.';
comment on function public.finance_refresh_rule_suggestions(uuid) is
  'Cron-compatible observable learning entry point for legacy rules and Phase 2 source templates.';

revoke execute on function public.finance_normalize_source_phrase(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_safe_source_candidate_phrase(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_source_candidate_phrases(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_source_phrase_matches(jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_source_templates_v1(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions_phase_one_v1(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.finance_refresh_rule_suggestions(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
