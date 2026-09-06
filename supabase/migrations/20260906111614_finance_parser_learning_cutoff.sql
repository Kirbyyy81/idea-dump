-- A per-user upload cutoff for algorithm 2 only. Legacy learners keep their existing history.
-- Settings are intentionally opt-in; deploying this migration does not reset any user.
create table finance_private.finance_parser_learning_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 eligible_from timestamptz not null check (isfinite(eligible_from)),
 updated_at timestamptz not null default clock_timestamp()
);
alter table finance_private.finance_parser_learning_settings enable row level security;
revoke all on finance_private.finance_parser_learning_settings from public,anon,authenticated,service_role;

create function finance_private.finance_parser_learning_cutoff(p_user_id uuid) returns timestamptz
language sql stable security invoker set search_path='' as $fn$
 select coalesce((select eligible_from from finance_private.finance_parser_learning_settings where user_id=p_user_id),'-infinity'::timestamptz);
$fn$;
revoke all on function finance_private.finance_parser_learning_cutoff(uuid) from public,anon,authenticated,service_role;

alter table public.finance_parser_templates add column learning_cutoff_at timestamptz not null default '-infinity';
comment on column public.finance_parser_templates.learning_cutoff_at is 'Immutable upload-time boundary for this template version. Old versions retain their original evidence.';

create function finance_private.finance_guard_parser_learning_cutoff() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
 if tg_op='UPDATE' and new.learning_cutoff_at is distinct from old.learning_cutoff_at then
  raise exception using errcode='23514',message='Template learning cutoff is immutable';
 end if;
 if new.algorithm_version=2 and (tg_op='INSERT' or new.status in ('active','shadow'))
  and new.learning_cutoff_at<>finance_private.finance_parser_learning_cutoff(new.user_id) then
  raise exception using errcode='23514',message='Template belongs to an earlier learning period';
 end if;
 return new;
end;
$fn$;
revoke all on function finance_private.finance_guard_parser_learning_cutoff() from public,anon,authenticated,service_role;
create trigger finance_guard_parser_learning_cutoff before insert or update on public.finance_parser_templates
for each row execute function finance_private.finance_guard_parser_learning_cutoff();

create function public.finance_set_parser_learning_cutoff(p_user_id uuid,p_eligible_from timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare previous_cutoff timestamptz; disabled_count integer; rejected_count integer;
begin
 if p_user_id is null or p_eligible_from is null or not isfinite(p_eligible_from) or p_eligible_from>clock_timestamp() then
  raise exception using errcode='22023',message='An existing user and a finite past or current cutoff are required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
 if not exists(select 1 from auth.users where id=p_user_id) then
  raise exception using errcode='22023',message='Learning user does not exist';
 end if;
 previous_cutoff:=finance_private.finance_parser_learning_cutoff(p_user_id);
 if p_eligible_from=previous_cutoff then return false; end if;
 if p_eligible_from<previous_cutoff then
  raise exception using errcode='22023',message='Learning cutoff cannot move backwards';
 end if;
 update public.finance_parser_templates set status='disabled',status_reason='learning_cutoff_changed'
 where user_id=p_user_id and algorithm_version=2 and status='active';
 get diagnostics disabled_count=row_count;
 update public.finance_parser_templates set status='rejected',status_reason='learning_cutoff_changed'
 where user_id=p_user_id and algorithm_version=2 and status in ('proposed','shadow');
 get diagnostics rejected_count=row_count;
 insert into finance_private.finance_parser_learning_settings(user_id,eligible_from)
 values(p_user_id,p_eligible_from) on conflict(user_id) do update set eligible_from=excluded.eligible_from,updated_at=clock_timestamp();
 insert into public.finance_learning_runs(invocation_id,algorithm_version,status,finished_at,templates_disabled,templates_rejected)
 values(gen_random_uuid(),2,'succeeded',clock_timestamp(),disabled_count,rejected_count);
 return true;
end;
$fn$;
revoke all on function public.finance_set_parser_learning_cutoff(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.finance_refresh_parser_templates_v2(p_run_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
<<refresh>>
declare proposed_count int:=0; updated_count int:=0; disabled_count int:=0; shadow_count int:=0; rejected_count int:=0; changed_count int;
 t record; r record; result jsonb; trace jsonb; truth text; outcome text; stage text;
 expected_hash text; support_count int; contradiction_count int; evaluation_count int;
 historical_count int; source_active boolean; new_status text; reason text;
begin
 if not exists(select 1 from public.finance_learning_runs where id=p_run_id) then raise exception 'Learning run required'; end if;
 -- Only reviewed corrections generate definitions. Configuration contains labels, never corrected values.
 with latest as materialized (
  select distinct on(c.user_id,c.transaction_id,c.field_name)
   c.user_id,c.transaction_id,c.field_name,c.corrected_value #>> '{}' corrected,
   tx.source_id,i.ocr_normalized_text,i.original_filename,
   coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'normalized_name',p.normalized_name,'is_archived',p.is_archived))
    from public.dim_finance_payees p where p.user_id=c.user_id and not p.is_archived),'[]') payees
  from public.finance_corrections c
  join public.finance_transactions tx on tx.id=c.transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
  join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
  join public.dim_finance_sources s on s.id=tx.source_id and s.user_id=c.user_id and not s.is_archived
  where c.field_name in ('source_id','reference_number','merchant','transaction_date','direction','payee_name','notes','recipient_reference')
   and i.created_at >= finance_private.finance_parser_learning_cutoff(c.user_id)
   and jsonb_typeof(c.corrected_value)='string' and i.ocr_normalized_text is not null
  order by c.user_id,c.transaction_id,c.field_name,c.created_at desc,c.id desc
 ), field_inputs as (
  select latest.*,field from latest cross join lateral unnest(
   case when field_name='notes' then array['notes','recipient_reference'] else array[field_name] end
  ) f(field) where field_name<>'source_id'
 ), configs as materialized (
  select f.user_id,f.source_id,f.field,f.transaction_id,cfg
  from field_inputs f cross join lateral public.finance_parser_candidate_configs_v2(f.field,f.ocr_normalized_text,f.corrected,f.payees) cfg
  union all
  select l.user_id,l.source_id,'source_id',l.transaction_id,cfg
  from latest l join public.dim_finance_sources s on s.id=l.source_id and s.user_id=l.user_id
  cross join lateral (
   select jsonb_build_object('type','source_phrase','phrase',public.finance_template_source_phrase_v2(alias),'location',location) cfg
   from (
    select unnest(s.filename_aliases||array[s.name]) alias,'filename' location
    union all select unnest(s.ocr_aliases||array[s.name]),'ocr_line'
    union all select unnest(array['transfer successful','payment successful','money received','transaction successful']),'header'
   ) aliases
   where length(public.finance_template_source_phrase_v2(alias)) between 3 and 120
    and public.finance_template_source_phrase_v2(alias) not in ('screenshot','image','photo','camera','png','jpg','jpeg')
  ) x
  where l.field_name='source_id' and l.corrected=l.source_id::text
   and public.finance_evaluate_parser_template_v2('source_id',cfg,l.ocr_normalized_text,l.original_filename)->>'outcome'='value'
 ), grouped as (
  select user_id,source_id,field,cfg,count(distinct transaction_id) support
  from configs group by user_id,source_id,field,cfg having count(distinct transaction_id)>=3
 ), ranked as (
  select *,row_number() over(partition by user_id,source_id,field order by support desc,cfg::text) rank from grouped
 )
 insert into public.finance_parser_templates(
  user_id,template_key,target_source_id,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at,predecessor_template_id)
 select x.user_id,'v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text),
  case when x.field='source_id' then x.source_id end,case when x.field<>'source_id' then x.source_id end,
  x.field,x.cfg->>'type',x.cfg,2,
  coalesce((select max(old.template_version) from public.finance_parser_templates old
   where old.user_id=x.user_id and old.algorithm_version=2
    and old.template_key='v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text)),0)+1,
  'proposed',finance_private.finance_parser_learning_cutoff(x.user_id),
  (select old.id from public.finance_parser_templates old where old.user_id=x.user_id
   and coalesce(old.scope_source_id,old.target_source_id)=x.source_id and old.field_name=x.field
   and old.configuration=x.cfg and old.algorithm_version in (1,2) order by old.algorithm_version desc,old.template_version desc,old.id limit 1)
 from ranked x where rank<=20 and not exists(
  select 1 from public.finance_parser_templates old where old.user_id=x.user_id and old.algorithm_version=2
   and old.template_key='v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text)
   and old.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(x.user_id))
 on conflict(user_id,template_key,algorithm_version,template_version) do nothing;
 get diagnostics proposed_count=row_count;

 -- Replay reviewed cases uploaded within the current learning period. Do not use the runtime trace as a history filter.
 for t in select * from public.finance_parser_templates where algorithm_version=2
  and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) order by user_id,id loop
  delete from public.finance_template_evidence e
  where e.template_id=t.id and not exists(
   select 1 from public.finance_candidate_transactions c join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id
   join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
   where i.created_at>=t.learning_cutoff_at and c.id=e.candidate_id and c.user_id=t.user_id and c.status='accepted' and tx.status='confirmed'
    and (t.field_name='source_id' or tx.source_id=t.scope_source_id)
  );
  for r in
   select c.id candidate_id,c.intake_item_id,c.created_at,c.payload,tx.id transaction_id,tx.source_id,
    tx.reference_number,tx.merchant,tx.transaction_date,tx.direction,tx.notes,p.name payee_name,
    i.ocr_normalized_text,i.original_filename,i.source_detection_signals,
    coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name,'normalized_name',sp.normalized_name,'is_archived',sp.is_archived))
     from public.dim_finance_payees sp where sp.user_id=t.user_id and not sp.is_archived),'[]') payees
   from public.finance_candidate_transactions c
   join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
   join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
   left join public.dim_finance_payees p on p.id=tx.payee_id and p.user_id=tx.user_id
   where c.user_id=t.user_id and c.status='accepted' and i.created_at>=t.learning_cutoff_at
    and (t.field_name='source_id' or tx.source_id=t.scope_source_id)
   order by c.id
  loop
   result:=public.finance_evaluate_parser_template_v2(t.field_name,t.configuration,r.ocr_normalized_text,r.original_filename,r.payees);
   truth:=case t.field_name when 'source_id' then r.source_id::text when 'reference_number' then r.reference_number
    when 'merchant' then r.merchant when 'transaction_date' then r.transaction_date::text when 'direction' then r.direction
    when 'payee_name' then r.payee_name else r.notes end;
   trace:=null; stage:='historical';
   if t.field_name='source_id' then
    select v into trace from jsonb_array_elements(coalesce(r.source_detection_signals,'[]')) v
    where v->>'template_id'=t.id::text and v->>'kind' in ('learned_source_shadow','learned_source_active') limit 1;
   else
    select v into trace from jsonb_array_elements(coalesce(r.payload->'parser_template_evaluations','[]')) v
    where v->>'template_id'=t.id::text and v->>'algorithm_version'='2'
     and v->>'template_version'=t.template_version::text limit 1;
   end if;
   if trace is not null and r.created_at>t.shadow_started_at then
    stage:=case when coalesce(trace->>'status',trace->>'template_status')='active' then 'active' else 'shadow' end;
   end if;
   outcome:=case when r.ocr_normalized_text is null or truth is null then 'unresolved_missing_context'
    when result->>'outcome'='not_applicable' then 'not_applicable'
    when result->>'outcome'='invalid_output' then 'invalid_output'
    when t.field_name='source_id' then case when truth=t.target_source_id::text then 'supported' else 'contradicted' end
    when t.field_name='recipient_reference' then case when result->>'value'=any(regexp_split_to_array(coalesce(truth,''),E'\\r?\\n')) then 'supported' else 'contradicted' end
    when public.finance_template_value_hash_v2(t.field_name,result->>'value')=public.finance_template_value_hash_v2(t.field_name,public.finance_template_value_v2(t.field_name,truth)) then 'supported'
    else 'contradicted' end;
   if stage<>'historical' and t.field_name<>'source_id' then
    expected_hash:=case when result->>'outcome'='value' then public.finance_template_value_hash_v2(t.field_name,result->>'value') end;
    if trace->>'outcome'='invalid_output' or (expected_hash is not null and trace->>'value_hash' is distinct from expected_hash) then outcome:='invalid_output'; end if;
    if trace->>'outcome'='conflict' then outcome:='contradicted'; end if;
   end if;
   insert into public.finance_template_evidence(template_id,user_id,candidate_id,intake_item_id,correction_id,outcome,algorithm_version,evaluation_stage)
   values(t.id,t.user_id,r.candidate_id,r.intake_item_id,
    (select c.id from public.finance_corrections c where c.user_id=t.user_id and c.transaction_id=r.transaction_id
     and c.field_name=case when t.field_name='recipient_reference' then 'notes' else t.field_name end order by c.created_at desc,c.id desc limit 1),
    outcome,2,stage)
   on conflict(template_id,candidate_id) where candidate_id is not null
   do update set correction_id=excluded.correction_id,outcome=excluded.outcome,evaluation_stage=excluded.evaluation_stage
   where (finance_template_evidence.correction_id,finance_template_evidence.outcome,finance_template_evidence.evaluation_stage)
    is distinct from (excluded.correction_id,excluded.outcome,excluded.evaluation_stage);
  end loop;
  select count(distinct c.confirmed_transaction_id) filter(where e.outcome='supported'),
   count(*) filter(where e.outcome in ('contradicted','invalid_output')),
   count(*) filter(where e.outcome in ('supported','contradicted','invalid_output')),count(*)
   into support_count,contradiction_count,evaluation_count,historical_count
  from public.finance_template_evidence e join public.finance_candidate_transactions c on c.id=e.candidate_id and c.user_id=e.user_id where e.template_id=t.id;
  select not s.is_archived into source_active from public.dim_finance_sources s where s.id=coalesce(t.scope_source_id,t.target_source_id) and s.user_id=t.user_id;
  reason:=case when source_active is not true then 'source_archived' when contradiction_count>0 then 'contradiction' when support_count<3 then 'insufficient_evidence' end;
  new_status:=case when reason is not null and t.status='active' then 'disabled'
   when reason in ('source_archived','contradiction') and t.status in ('proposed','shadow') then 'rejected' else t.status end;
  if new_status in ('disabled','rejected') then reason:=coalesce(reason,t.status_reason); end if;
  -- Status and metrics change atomically so the active-template guard cannot prevent disable.
  update public.finance_parser_templates set evidence_count=support_count,contradiction_count=refresh.contradiction_count,
   evaluation_count=refresh.evaluation_count,precision=case when refresh.evaluation_count>0 then round(support_count::numeric/refresh.evaluation_count,6) end,
   coverage=case when historical_count>0 then round(refresh.evaluation_count::numeric/historical_count,6) end,
   status=new_status,status_reason=case when new_status in ('disabled','rejected') then coalesce(reason,t.status_reason) else reason end,evaluated_at=clock_timestamp()
  where id=t.id and (evidence_count,finance_parser_templates.contradiction_count,finance_parser_templates.evaluation_count,status,status_reason,precision,coverage)
    is distinct from (support_count,refresh.contradiction_count,refresh.evaluation_count,new_status,reason,
     case when refresh.evaluation_count>0 then round(support_count::numeric/refresh.evaluation_count,6) end,
     case when historical_count>0 then round(refresh.evaluation_count::numeric/historical_count,6) end);
  get diagnostics changed_count=row_count;
  updated_count:=updated_count+changed_count;
  if t.status<>'rejected' and new_status='rejected' then rejected_count:=rejected_count+1; end if;
  if t.status='active' and new_status='disabled' then disabled_count:=disabled_count+1; end if;
  if new_status='proposed' and reason is null and support_count>=3
   and (t.field_name='source_id' or (select count(*) from public.finance_parser_templates p
    where p.user_id=t.user_id and p.field_name<>'source_id' and p.algorithm_version=2 and p.status in ('active','shadow'))<1000) then
   if (select count(*) from public.finance_parser_templates p where p.user_id=t.user_id and p.status in ('active','shadow')
    and p.field_name=t.field_name and (t.field_name='source_id' or p.scope_source_id=t.scope_source_id))
     < (case when t.field_name='source_id' then 40 else 20 end) then
    update public.finance_parser_templates set status='shadow',status_reason=null where id=t.id;
    shadow_count:=shadow_count+1;
   end if;
  end if;
 end loop;
 return jsonb_build_object('proposed',proposed_count,'updated',updated_count,'disabled',disabled_count,'shadowed',shadow_count,'rejected',rejected_count);
end;
$fn$;

create or replace function public.finance_parser_template_can_promote_v2(p_template_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $fn$
 select coalesce((
  select t.algorithm_version=2 and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id) and t.status='shadow' and t.contradiction_count=0 and t.precision=1 and t.evidence_count>=3
   and t.field_name<>'amount' and s.is_archived=false
   and t.evaluation_count>=least(5,(select count(*) from public.finance_template_evidence e where e.template_id=t.id))
   and (select count(distinct c.confirmed_transaction_id)
    from public.finance_template_evidence e join public.finance_candidate_transactions c on c.id=e.candidate_id and c.user_id=e.user_id
    where e.template_id=t.id and e.evaluation_stage='shadow' and e.outcome='supported' and c.created_at>t.shadow_started_at)>=3
   and not exists(select 1 from public.finance_template_evidence e where e.template_id=t.id and e.outcome in ('contradicted','invalid_output'))
   -- Conservative ambiguity gate: overlapping observed applicability blocks promotion.
   and not exists(
    select 1 from public.finance_parser_templates peer
    join public.finance_template_evidence pe on pe.template_id=peer.id
    join public.finance_template_evidence own on own.template_id=t.id and own.candidate_id=pe.candidate_id
    where peer.user_id=t.user_id and peer.id<>t.id and peer.status='active' and peer.field_name=t.field_name
     and own.outcome='supported' and pe.outcome in ('supported','contradicted','invalid_output')
     and (t.field_name='source_id' or peer.scope_source_id=t.scope_source_id)
   )
  from public.finance_parser_templates t join public.dim_finance_sources s
   on s.id=coalesce(t.scope_source_id,t.target_source_id) and s.user_id=t.user_id where t.id=p_template_id
 ),false);
$fn$;
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
  legacy_inserted_rows integer := 0;
  inserted_run_count integer := 0;
  transaction_started_at timestamp with time zone := now();
  failure_sqlstate text;
  safe_failure_code text;
begin
  if p_invocation_id is null then
    raise exception using errcode = '22023', message = 'Learning invocation ID is required';
  end if;



  insert into public.finance_learning_runs(invocation_id,algorithm_version)
  values (p_invocation_id,2)
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


    template_result := public.finance_refresh_parser_templates_v2(run_row.id);
    insert into public.finance_learning_run_user_summaries(run_id,user_id,corrections_examined)
    select run_row.id,c.user_id,count(*) from (
      select distinct on(c.user_id,c.transaction_id,c.field_name) c.user_id,c.id
      from public.finance_corrections c join public.finance_transactions tx on tx.id=c.transaction_id and tx.user_id=c.user_id
      where tx.status='confirmed' and c.field_name in ('category_id','source_id','reference_number','merchant','transaction_date','direction','payee_name','notes','recipient_reference')
      order by c.user_id,c.transaction_id,c.field_name,c.created_at desc,c.id desc
    ) c group by c.user_id
    on conflict(run_id,user_id) do update set corrections_examined=excluded.corrections_examined;
    insert into public.finance_learning_run_user_summaries(run_id,user_id,reason_counts)
    select run_row.id,user_id,jsonb_object_agg(reason,n) from (
      select user_id,status_reason reason,count(*) n from public.finance_parser_templates
      where algorithm_version=2 and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict')
      group by user_id,status_reason
    ) reasons group by user_id
    on conflict(run_id,user_id) do update set reason_counts=excluded.reason_counts;
    update public.finance_learning_runs set
      templates_proposed=coalesce((template_result->>'proposed')::int,0),
      templates_updated=coalesce((template_result->>'updated')::int,0),
      templates_shadowed=coalesce((template_result->>'shadowed')::int,0),
      templates_disabled=coalesce((template_result->>'disabled')::int,0),
      templates_rejected=coalesce((template_result->>'rejected')::int,0),
      candidates_evaluated=(select count(distinct e.candidate_id) from public.finance_template_evidence e
        join public.finance_parser_templates t on t.id=e.template_id where t.algorithm_version=2
         and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id)),
      reason_counts=coalesce((select jsonb_object_agg(reason,n) from (
        select status_reason reason,count(*) n from public.finance_parser_templates
        where algorithm_version=2 and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict') group by status_reason
      ) reasons),'{}'::jsonb),
      corrections_examined=(select coalesce(sum(corrections_examined),0) from public.finance_learning_run_user_summaries where run_id=run_row.id),
      finished_at=clock_timestamp()
    where id=run_row.id;

    delete from public.finance_learning_runs runs
    where runs.finished_at < pg_catalog.clock_timestamp() - interval '90 days'
      and runs.status in ('succeeded', 'failed');

    return legacy_inserted_rows;
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


create or replace function public.finance_requeue_parser_template_v2(p_template_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $fn$
declare invocation uuid:=gen_random_uuid(); changed boolean;
begin
 perform public.finance_refresh_rule_suggestions(invocation);
 if not exists(select 1 from public.finance_learning_runs where invocation_id=invocation and status='succeeded') then return false; end if;
 update public.finance_parser_templates t set status='shadow',status_reason=null
 from public.dim_finance_sources s
 where t.id=p_template_id and t.algorithm_version=2 and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id) and t.status='disabled'
  and s.id=coalesce(t.scope_source_id,t.target_source_id) and s.user_id=t.user_id and not s.is_archived
  and t.evidence_count>=3 and t.contradiction_count=0 and t.precision=1;
 changed:=found;
 if changed then
  update public.finance_learning_runs set templates_shadowed=templates_shadowed+1 where invocation_id=invocation;
 end if;
 return changed;
end;
$fn$;

notify pgrst, 'reload schema';
