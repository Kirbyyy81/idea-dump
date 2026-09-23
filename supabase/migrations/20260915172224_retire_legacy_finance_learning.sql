-- Retire legacy writers before deploying runtimes that omit their readers.
-- Keep rows, candidate traces and historical learning-run metrics intact.
select pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
update public.finance_rules set is_active=false where source='learning' and is_active;
update public.finance_field_learning_rules set is_active=false where is_active;

create or replace function public.finance_refresh_rule_suggestions_legacy_v1() returns integer
language sql security invoker set search_path='' as $fn$ select 0; $fn$;

create function finance_private.finance_guard_retired_learning() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
 if tg_table_name='finance_rules' then
  if (tg_op='INSERT' and new.source='learning') or
     (tg_op='UPDATE' and old.source is distinct from new.source) or
     (new.source='learning' and new.is_active) then
   raise exception using errcode='23514',message='Legacy learning rules are retired';
  end if;
 elsif tg_table_name='finance_field_learning_rules' then
  if tg_op='INSERT' or new.is_active or new.evidence_count is distinct from old.evidence_count then
   raise exception using errcode='23514',message='Legacy reference learning is retired';
  end if;
 else
  if tg_op='INSERT' or new.status is distinct from old.status then
   raise exception using errcode='23514',message='Legacy rule suggestions are retired';
  end if;
 end if;
 return new;
end; $fn$;
create trigger finance_rules_guard_retired_learning before insert or update on public.finance_rules
 for each row execute function finance_private.finance_guard_retired_learning();
create trigger finance_field_rules_guard_retired_learning before insert or update on public.finance_field_learning_rules
 for each row execute function finance_private.finance_guard_retired_learning();
create trigger finance_suggestions_guard_retired_learning before insert or update on public.finance_rule_suggestions
 for each row execute function finance_private.finance_guard_retired_learning();

create or replace function public.finance_accept_rule_suggestion(p_user_id uuid,p_suggestion_id uuid)
returns public.finance_rules language plpgsql security invoker set search_path='' as $fn$
begin
 if not public.finance_user_can_access_module_v1(p_user_id,'finance') then
  raise exception using errcode='42501',message='Finance access denied';
 end if;
 if not exists(select 1 from public.finance_rule_suggestions where id=p_suggestion_id and user_id=p_user_id) then
  raise exception using errcode='P0002',message='Finance rule suggestion not found';
 end if;
 raise exception using errcode='23514',message='Legacy rule suggestions are retired';
end; $fn$;

create or replace function public.finance_refresh_rule_suggestions(
  p_invocation_id uuid default gen_random_uuid()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  run_row public.finance_learning_runs%rowtype;
  template_result jsonb;
  inserted_run_count integer := 0;
  failure_sqlstate text;
  safe_failure_code text;
begin
  if p_invocation_id is null then
    raise exception using errcode = '22023', message = 'Learning invocation ID is required';
  end if;



  insert into public.finance_learning_runs(invocation_id,algorithm_version)
  values (p_invocation_id,3)
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

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('finance_refresh_rule_suggestions',1)) then
    update public.finance_learning_runs set status='failed',finished_at=clock_timestamp(),failure_stage='learning_lock',failure_code='database_retryable' where id=run_row.id;
    return 0;
  end if;

  begin
    template_result := public.finance_refresh_parser_templates_v2(run_row.id);
    select jsonb_object_agg(v2.key,(v2.value::int+v3.value::int))
     into template_result from jsonb_each_text(template_result) v2
     join jsonb_each_text(public.finance_refresh_parser_templates_v3(run_row.id)) v3 on v3.key=v2.key;
    insert into public.finance_learning_run_user_summaries(run_id,user_id,corrections_examined)
    select run_row.id,c.user_id,count(*) from (
      select distinct on(c.user_id,c.transaction_id,c.field_name) c.user_id,c.id
      from public.finance_corrections c join public.finance_transactions tx on tx.id=c.transaction_id and tx.user_id=c.user_id
      where tx.status='confirmed' and c.field_name in ('source_id','reference_number','merchant','transaction_date','direction','payee_name','notes','recipient_reference')
      order by c.user_id,c.transaction_id,c.field_name,c.created_at desc,c.id desc
    ) c group by c.user_id
    on conflict(run_id,user_id) do update set corrections_examined=excluded.corrections_examined;
    insert into public.finance_learning_run_user_summaries(run_id,user_id,reason_counts)
    select run_row.id,user_id,jsonb_object_agg(reason,n) from (
      select user_id,status_reason reason,count(*) n from public.finance_parser_templates
      where algorithm_version in (2,3) and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict')
      group by user_id,status_reason
    ) reasons group by user_id
    on conflict(run_id,user_id) do update set reason_counts=excluded.reason_counts;
    update public.finance_learning_runs set
      status='succeeded',
      templates_proposed=coalesce((template_result->>'proposed')::int,0),
      templates_updated=coalesce((template_result->>'updated')::int,0),
      templates_shadowed=coalesce((template_result->>'shadowed')::int,0),
      templates_disabled=coalesce((template_result->>'disabled')::int,0),
      templates_rejected=coalesce((template_result->>'rejected')::int,0),
      candidates_evaluated=(select count(distinct e.candidate_id) from public.finance_template_evidence e
        join public.finance_parser_templates t on t.id=e.template_id where t.algorithm_version in (2,3)
         and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id)),
      reason_counts=coalesce((select jsonb_object_agg(reason,n) from (
        select status_reason reason,count(*) n from public.finance_parser_templates
        where algorithm_version in (2,3) and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict') group by status_reason
      ) reasons),'{}'::jsonb),
      corrections_examined=(select coalesce(sum(corrections_examined),0) from public.finance_learning_run_user_summaries where run_id=run_row.id),
      finished_at=clock_timestamp()
    where id=run_row.id;

    delete from public.finance_learning_runs runs
    where runs.finished_at < pg_catalog.clock_timestamp() - interval '90 days'
      and runs.status in ('succeeded', 'failed');

    return 0;
  exception
    when query_canceled or others then
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
          failure_stage = 'parser_learning_refresh',
          failure_code = safe_failure_code
      where runs.id = run_row.id;

      delete from public.finance_learning_runs runs
      where runs.finished_at < pg_catalog.clock_timestamp() - interval '90 days'
        and runs.status in ('succeeded', 'failed');

      return 0;
  end;
end;
$function$;


revoke all on function finance_private.finance_guard_retired_learning(),public.finance_refresh_rule_suggestions_legacy_v1() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
