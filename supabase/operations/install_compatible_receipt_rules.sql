-- Operator-only data operation for the six definitions supported before the
-- reviewed-receipt runtime rollout. Set receipt_rules.user_id, ryt_source_id,
-- and tng_source_id in this session to verified UUIDs before executing.
begin;
set local statement_timeout = '90s';
do $install$
declare
  account_id uuid := current_setting('receipt_rules.user_id')::uuid;
  ryt_id uuid := current_setting('receipt_rules.ryt_source_id')::uuid;
  tng_id uuid := current_setting('receipt_rules.tng_source_id')::uuid;
  boundary timestamptz;
  invocation uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions', 1));
  boundary := finance_private.finance_parser_learning_cutoff(account_id);
  if not isfinite(boundary) then raise exception 'Configure an explicit learning cutoff first'; end if;
  if ryt_id = tng_id or (select count(*) from public.dim_finance_sources
    where id in (ryt_id, tng_id) and user_id = account_id and not is_archived) <> 2 then
    raise exception 'Select two distinct active sources owned by this user';
  end if;
  with definitions(source_id, field_name, configuration) as (values
    (ryt_id, 'source_id', '{"type":"source_phrase","phrase":"ryt bank","location":"filename"}'::jsonb),
    (tng_id, 'source_id', '{"type":"source_phrase","phrase":"tng ewallet","location":"filename"}'::jsonb),
    (tng_id, 'direction', '{"type":"direction_phrase","phrases":["transaction type payment"],"direction":"expense"}'::jsonb),
    (tng_id, 'direction', '{"type":"direction_phrase","phrases":["transaction type receive from wallet"],"direction":"income"}'::jsonb),
    (tng_id, 'merchant', '{"type":"same_line_label","label":"merchant"}'::jsonb),
    (tng_id, 'payee_name', '{"type":"same_line_label","label":"receive from"}'::jsonb)
  ), keyed as (
    select *, 'v2:' || md5(source_id::text || ':' || field_name || ':' || configuration::text) key from definitions
  )
  insert into public.finance_parser_templates(user_id, template_key, target_source_id, scope_source_id,
    field_name, template_type, configuration, algorithm_version, template_version, status, learning_cutoff_at)
  select account_id, d.key, case when d.field_name = 'source_id' then d.source_id end,
    case when d.field_name <> 'source_id' then d.source_id end, d.field_name, d.configuration->>'type',
    d.configuration, 2, coalesce((select max(t.template_version) from public.finance_parser_templates t
      where t.user_id = account_id and t.template_key = d.key and t.algorithm_version = 2), 0) + 1,
    'proposed', boundary
  from keyed d where not exists(select 1 from public.finance_parser_templates t
    where t.user_id = account_id and t.template_key = d.key and t.algorithm_version = 2 and t.learning_cutoff_at = boundary);
  perform public.finance_refresh_rule_suggestions(invocation);
  if not exists(select 1 from public.finance_learning_runs where invocation_id = invocation and status = 'succeeded') then
    raise exception 'Approved rule replay failed';
  end if;
  raise notice 'Verified receipt rule replay: %', invocation;
end;
$install$;
commit;
