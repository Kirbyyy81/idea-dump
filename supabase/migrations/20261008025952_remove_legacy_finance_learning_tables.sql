-- Remove empty retired tables and their obsolete RPC chain.
-- Historical migration files, correction payloads and learning-run metrics remain intact.
lock table public.finance_rule_suggestions, public.finance_field_learning_rules in access exclusive mode;
do $empty_tables$
begin
  if exists (select 1 from public.finance_rule_suggestions)
     or exists (select 1 from public.finance_field_learning_rules) then
    raise exception 'Legacy Finance tables must be empty before removal';
  end if;
end;
$empty_tables$;

CREATE OR REPLACE FUNCTION public.finance_learning_summary_v1(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  latest_run public.finance_learning_runs%rowtype;
  user_summary public.finance_learning_run_user_summaries%rowtype;
  template_counts jsonb;
  active_metrics jsonb;
  recent_outcomes jsonb;
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
    'active_reference_rules', 0,
    'active_metrics', active_metrics,
    'recent_outcomes', recent_outcomes
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_delete_source(p_user_id uuid, p_source_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform 1
  from public.dim_finance_sources
  where id = p_source_id
    and user_id = p_user_id
  for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from public.finance_transactions where user_id = p_user_id and source_id = p_source_id)
     or exists (select 1 from public.finance_rules where user_id = p_user_id and source_id = p_source_id)
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

  delete from public.dim_finance_sources
  where id = p_source_id
    and user_id = p_user_id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_delete_category(p_user_id uuid, p_category_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform 1
  from public.dim_finance_categories
  where id = p_category_id
    and user_id = p_user_id
  for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from public.finance_transactions where user_id = p_user_id and category_id = p_category_id)
     or exists (select 1 from public.finance_rules where user_id = p_user_id and category_id = p_category_id)
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

  delete from public.dim_finance_categories
  where id = p_category_id
    and user_id = p_user_id;

  return true;
end;
$function$;

create or replace function finance_private.finance_guard_retired_learning()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if (tg_op = 'INSERT' and new.source = 'learning')
     or (tg_op = 'UPDATE' and old.source is distinct from new.source)
     or (new.source = 'learning' and new.is_active) then
    raise exception using errcode = '23514', message = 'Legacy learning rules are retired';
  end if;
  return new;
end;
$function$;

drop function public.finance_accept_rule_suggestion(uuid, uuid) restrict;
drop function public.finance_refresh_rule_suggestions_phase_two_v1(uuid) restrict;
drop function public.finance_refresh_rule_suggestions_phase_one_v1(uuid) restrict;
drop function public.finance_refresh_rule_suggestions_legacy_v1() restrict;

drop table public.finance_rule_suggestions restrict;
drop table public.finance_field_learning_rules restrict;

do $no_callers$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'finance_private')
      and p.prosrc ~ 'finance_rule_suggestions|finance_field_learning_rules|finance_accept_rule_suggestion|finance_refresh_rule_suggestions_(phase_one_v1|phase_two_v1|legacy_v1)'
  ) then
    raise exception 'Legacy Finance database callers remain';
  end if;
end;
$no_callers$;

notify pgrst, 'reload schema';
