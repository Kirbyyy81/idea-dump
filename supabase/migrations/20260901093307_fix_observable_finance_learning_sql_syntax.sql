create or replace function public.finance_guard_parser_template_write()
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
    new.evaluated_at := coalesce(new.evaluated_at, pg_catalog.clock_timestamp());
    new.activated_at := null;
    new.disabled_at := null;
  elsif new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.evaluated_at := coalesce(new.evaluated_at, pg_catalog.clock_timestamp());
    new.activated_at := pg_catalog.clock_timestamp();
    new.disabled_at := null;
  elsif new.status = 'disabled' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.disabled_at := coalesce(new.disabled_at, pg_catalog.clock_timestamp());
  elsif new.status = 'proposed' and tg_op = 'UPDATE' and old.status = 'rejected' then
    new.evaluated_at := null;
    new.activated_at := null;
    new.disabled_at := null;
    new.status_reason := null;
  end if;

  if new.status in ('shadow', 'active') then
    select not sources.is_archived into source_is_active
    from public.dim_finance_sources sources
    where sources.id = coalesce(new.scope_source_id, new.target_source_id)
      and sources.user_id = new.user_id;

    if source_is_active is distinct from true then
      raise exception using errcode = '23514', message = 'Parser template source must be active';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.user_id::text || ':' || new.field_name || ':' || coalesce(
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
      and coalesce(templates.scope_source_id, templates.target_source_id)
        = coalesce(new.scope_source_id, new.target_source_id)
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

create or replace function public.finance_refresh_rule_suggestions(
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
    return coalesce(run_row.legacy_inserted_count, 0);
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
        coalesce(pg_catalog.sum(summaries.corrections_examined), 0)::integer as corrections_examined,
        coalesce(pg_catalog.sum(
          summaries.category_rules_created + summaries.reference_rules_created
        ), 0)::integer as rules_created,
        coalesce(pg_catalog.sum(
          summaries.category_rules_updated + summaries.reference_rules_updated
        ), 0)::integer as rules_updated,
        coalesce(pg_catalog.sum(
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

create or replace function public.finance_learning_summary_v1(p_user_id uuid)
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

  select coalesce(
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

  select coalesce(
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
      'corrections_examined', coalesce(user_summary.corrections_examined, 0),
      'category_rules_created', coalesce(user_summary.category_rules_created, 0),
      'category_rules_updated', coalesce(user_summary.category_rules_updated, 0),
      'category_rules_disabled', coalesce(user_summary.category_rules_disabled, 0),
      'reference_rules_created', coalesce(user_summary.reference_rules_created, 0),
      'reference_rules_updated', coalesce(user_summary.reference_rules_updated, 0),
      'reference_rules_disabled', coalesce(user_summary.reference_rules_disabled, 0)
    ),
    'template_counts', template_counts,
    'active_reference_rules', active_reference_rules,
    'active_metrics', active_metrics,
    'recent_outcomes', recent_outcomes
  );
end;
$function$;

comment on column public.finance_learning_runs.algorithm_version is
  'Learning algorithm version. Phase 1 functions use portable COALESCE syntax.';
