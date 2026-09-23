-- Preserve receipt-format isolation when algorithms 2 and 3 run together.
-- Apply after both additive format support and algorithm 3, before enabling OCR.
alter table public.finance_parser_templates drop constraint finance_template_format_field;
alter table public.finance_parser_templates add constraint finance_template_format_field
 check(scope_receipt_format is null or (field_name<>'source_id' and algorithm_version in (2,3)));

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
   tx.source_id,i.ocr_normalized_text,i.original_filename,i.receipt_format,
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
 ), source_inputs as materialized (
  -- Accepted candidates and confirmed transactions are the explicit review boundary.
  select distinct on(c.user_id,c.confirmed_transaction_id) c.user_id,c.confirmed_transaction_id transaction_id,
   tx.source_id,i.ocr_normalized_text,i.original_filename
  from public.finance_candidate_transactions c
  join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
  join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
  join public.dim_finance_sources s on s.id=tx.source_id and s.user_id=c.user_id and not s.is_archived
  where c.status='accepted' and i.created_at>=finance_private.finance_parser_learning_cutoff(c.user_id) and i.ocr_normalized_text is not null
  order by c.user_id,c.confirmed_transaction_id,c.created_at desc,c.id desc
 ), field_inputs as (
  select latest.*,field from latest cross join lateral unnest(
   case when field_name='notes' then array['notes','recipient_reference'] else array[field_name] end
  ) f(field) where field_name<>'source_id'
 ), configs as materialized (
  select f.user_id,f.source_id,f.field,f.transaction_id,cfg,
   case when f.receipt_format<>'unknown' then f.receipt_format end scope_format
  from field_inputs f cross join lateral public.finance_parser_receipt_configs_v2(f.field,f.ocr_normalized_text,f.corrected,f.original_filename,f.payees) cfg
  where f.receipt_format<>'unknown' or not exists(select 1 from public.dim_finance_sources rs where rs.id=f.source_id and rs.user_id=f.user_id and public.finance_template_source_phrase_v2(rs.name)='ryt bank')
  union all
  select l.user_id,l.source_id,'source_id',l.transaction_id,cfg,null::text
  from source_inputs l join public.dim_finance_sources s on s.id=l.source_id and s.user_id=l.user_id
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
  where public.finance_evaluate_parser_template_v2('source_id',cfg,l.ocr_normalized_text,l.original_filename)->>'outcome'='value'
 ), grouped as (
  select user_id,source_id,field,cfg,scope_format,count(distinct transaction_id) support
  from configs group by user_id,source_id,field,cfg,scope_format having count(distinct transaction_id)>=3
 ), ranked as (
  select *,row_number() over(partition by user_id,source_id,field,scope_format order by support desc,cfg::text) rank from grouped
 )
 insert into public.finance_parser_templates(
  user_id,template_key,target_source_id,scope_source_id,scope_receipt_format,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at,predecessor_template_id)
 select x.user_id,'v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,'')),
  case when x.field='source_id' then x.source_id end,case when x.field<>'source_id' then x.source_id end,
  x.scope_format,x.field,x.cfg->>'type',x.cfg,2,
  coalesce((select max(old.template_version) from public.finance_parser_templates old
   where old.user_id=x.user_id and old.algorithm_version=2
    and old.template_key='v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,''))),0)+1,
  'proposed',finance_private.finance_parser_learning_cutoff(x.user_id),
  (select old.id from public.finance_parser_templates old where old.user_id=x.user_id
   and coalesce(old.scope_source_id,old.target_source_id)=x.source_id and old.field_name=x.field
   and old.scope_receipt_format is not distinct from x.scope_format and old.configuration=x.cfg and old.algorithm_version in (1,2) order by old.algorithm_version desc,old.template_version desc,old.id limit 1)
 from ranked x where rank<=20 and not exists(
  select 1 from public.finance_parser_templates old where old.user_id=x.user_id and old.algorithm_version=2
   and old.template_key='v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,''))
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
    and (t.field_name='source_id' or (tx.source_id=t.scope_source_id and public.finance_receipt_format_matches(t.scope_receipt_format,i.receipt_format)))
  );
  for r in
   select c.id candidate_id,c.intake_item_id,c.created_at,c.payload,tx.id transaction_id,tx.source_id,
    tx.reference_number,tx.merchant,tx.transaction_date,tx.direction,tx.notes,p.name payee_name,
    i.ocr_normalized_text,i.original_filename,i.source_detection_signals,i.receipt_processing,i.receipt_format,
    coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name,'normalized_name',sp.normalized_name,'is_archived',sp.is_archived))
     from public.dim_finance_payees sp where sp.user_id=t.user_id and not sp.is_archived),'[]') payees
   from public.finance_candidate_transactions c
   join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
   join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
   left join public.dim_finance_payees p on p.id=tx.payee_id and p.user_id=tx.user_id
   where c.user_id=t.user_id and c.status='accepted' and i.created_at>=t.learning_cutoff_at
    and (t.field_name='source_id' or (tx.source_id=t.scope_source_id and public.finance_receipt_format_matches(t.scope_receipt_format,i.receipt_format)))
   order by c.id
  loop
   result:=public.finance_evaluate_parser_template_v2(t.field_name,t.configuration,r.ocr_normalized_text,r.original_filename,r.payees);
   if coalesce(r.receipt_processing->'conflicts','[]') ? (case when t.field_name='recipient_reference' then 'notes' else t.field_name end) then result:=jsonb_build_object('outcome','invalid_output'); end if;
   if r.receipt_format='ryt_shared_v1' and t.field_name in ('merchant','payee_name') and btrim(result->>'value') ~* '^(recipient|payee|merchant|(recipient )?reference( id)?|transfer|ryt bank|logo)$|(duitnow|buitnow|buithow|[|])' then result:=jsonb_build_object('outcome','invalid_output'); end if;
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
    where p.user_id=t.user_id and p.field_name<>'source_id' and p.algorithm_version in (2,3) and p.status in ('active','shadow'))<1000) then
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


create or replace function public.finance_refresh_parser_templates_v3(p_run_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
<<refresh>>
declare proposed_count int:=0; updated_count int:=0; disabled_count int:=0; shadow_count int:=0; rejected_count int:=0; changed_count int;
 t record; r record; result jsonb; trace jsonb; truth text; outcome text; stage text;
 expected_hash text; support_count int; contradiction_count int; evaluation_count int;
 historical_count int; source_active boolean; new_status text; reason text;
begin
 if not exists(select 1 from public.finance_learning_runs where id=p_run_id) then raise exception 'Learning run required'; end if;
 -- Only reviewed corrections generate definitions. Configuration contains labels, never corrected values.
 with latest_corrections as materialized (
  select distinct on(user_id,transaction_id,field_name) * from public.finance_corrections
  where field_name in ('reference_number','merchant','transaction_date','direction','payee_name','notes','recipient_reference')
  order by user_id,transaction_id,field_name,created_at desc,id desc
 ), latest as materialized (
  select distinct on(c.user_id,c.transaction_id,c.field_name)
   c.user_id,c.transaction_id,c.field_name,c.corrected_value #>> '{}' corrected,
   tx.source_id,i.ocr_normalized_text,i.original_filename,i.receipt_format,accepted.payload->'parser_template_baseline' baseline,
   coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'normalized_name',p.normalized_name,'is_archived',p.is_archived))
    from public.dim_finance_payees p where p.user_id=c.user_id and not p.is_archived),'[]') payees
  from latest_corrections c
  join public.finance_transactions tx on tx.id=c.transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
  join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
  join lateral (
   select a.payload from public.finance_candidate_transactions a
   where a.user_id=c.user_id and a.confirmed_transaction_id=c.transaction_id
    and a.intake_item_id=c.intake_item_id and a.status='accepted'
   order by a.created_at desc,a.id desc limit 1
  ) accepted on true
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
  select f.user_id,f.source_id,f.field,f.transaction_id,cfg,
   case when f.receipt_format<>'unknown' then f.receipt_format end scope_format
  from field_inputs f cross join lateral public.finance_parser_candidate_configs_v3(f.field,f.ocr_normalized_text,f.corrected,f.payees,f.baseline) cfg
  where f.receipt_format<>'unknown' or not exists(select 1 from public.dim_finance_sources rs where rs.id=f.source_id and rs.user_id=f.user_id and public.finance_template_source_phrase_v2(rs.name)='ryt bank')
 ), grouped as (
  select user_id,source_id,field,cfg,scope_format,count(distinct transaction_id) support
  from configs group by user_id,source_id,field,cfg,scope_format having count(distinct transaction_id)>=3
 ), ranked as (
  select *,row_number() over(partition by user_id,source_id,field,scope_format order by support desc,cfg::text) rank from grouped
 )
 insert into public.finance_parser_templates(
  user_id,template_key,target_source_id,scope_source_id,scope_receipt_format,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at,predecessor_template_id)
 select x.user_id,'v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,'')),
  case when x.field='source_id' then x.source_id end,case when x.field<>'source_id' then x.source_id end,
  x.scope_format,x.field,x.cfg->>'type',x.cfg,3,
  coalesce((select max(old.template_version) from public.finance_parser_templates old
   where old.user_id=x.user_id and old.algorithm_version=3
    and old.template_key='v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,''))),0)+1,
  'proposed',finance_private.finance_parser_learning_cutoff(x.user_id),
  (select old.id from public.finance_parser_templates old where old.user_id=x.user_id
   and coalesce(old.scope_source_id,old.target_source_id)=x.source_id and old.field_name=x.field
   and old.scope_receipt_format is not distinct from x.scope_format and old.configuration=x.cfg and old.algorithm_version in (1,2,3) order by old.algorithm_version desc,old.template_version desc,old.id limit 1)
 from ranked x where rank<=20 and not exists(
  select 1 from public.finance_parser_templates old where old.user_id=x.user_id and old.algorithm_version=3
   and old.template_key='v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text||coalesce(':'||x.scope_format,''))
   and old.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(x.user_id))
 on conflict(user_id,template_key,algorithm_version,template_version) do nothing;
 get diagnostics proposed_count=row_count;

 -- Replay reviewed cases uploaded within the current learning period. Do not use the runtime trace as a history filter.
 for t in select * from public.finance_parser_templates where algorithm_version=3
  and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) order by user_id,id loop
  delete from public.finance_template_evidence e
  where e.template_id=t.id and not exists(
   select 1 from public.finance_candidate_transactions c join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id
   join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
   where i.created_at>=t.learning_cutoff_at and c.id=e.candidate_id and c.user_id=t.user_id and c.status='accepted' and tx.status='confirmed'
    and (t.field_name='source_id' or (tx.source_id=t.scope_source_id and public.finance_receipt_format_matches(t.scope_receipt_format,i.receipt_format)))
  );
  for r in
   select c.id candidate_id,c.intake_item_id,c.created_at,c.payload,tx.id transaction_id,tx.source_id,
    tx.reference_number,tx.merchant,tx.transaction_date,tx.direction,tx.notes,p.name payee_name,
    i.ocr_normalized_text,i.original_filename,i.source_detection_signals,i.receipt_processing,i.receipt_format,
    coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name,'normalized_name',sp.normalized_name,'is_archived',sp.is_archived))
     from public.dim_finance_payees sp where sp.user_id=t.user_id and not sp.is_archived),'[]') payees
   from public.finance_candidate_transactions c
   join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id and tx.status='confirmed'
   join public.finance_intake_items i on i.id=c.intake_item_id and i.user_id=c.user_id
   left join public.dim_finance_payees p on p.id=tx.payee_id and p.user_id=tx.user_id
   where c.user_id=t.user_id and c.status='accepted' and i.created_at>=t.learning_cutoff_at
    and (t.field_name='source_id' or (tx.source_id=t.scope_source_id and public.finance_receipt_format_matches(t.scope_receipt_format,i.receipt_format)))
   order by c.id
  loop
   result:=public.finance_evaluate_parser_template_v3(t.field_name,t.configuration,r.ocr_normalized_text,r.payees,r.payload->'parser_template_baseline');
   if coalesce(r.receipt_processing->'conflicts','[]') ? (case when t.field_name='recipient_reference' then 'notes' else t.field_name end) then result:=jsonb_build_object('outcome','invalid_output'); end if;
   if r.receipt_format='ryt_shared_v1' and t.field_name in ('merchant','payee_name') and btrim(result->>'value') ~* '^(recipient|payee|merchant|(recipient )?reference( id)?|transfer|ryt bank|logo)$|(duitnow|buitnow|buithow|[|])' then result:=jsonb_build_object('outcome','invalid_output'); end if;
   truth:=case t.field_name when 'source_id' then r.source_id::text when 'reference_number' then r.reference_number
    when 'merchant' then r.merchant when 'transaction_date' then r.transaction_date::text when 'direction' then r.direction
    when 'payee_name' then r.payee_name else r.notes end;
   trace:=null; stage:='historical';
   if t.field_name='source_id' then
    select v into trace from jsonb_array_elements(coalesce(r.source_detection_signals,'[]')) v
    where v->>'template_id'=t.id::text and v->>'kind' in ('learned_source_shadow','learned_source_active') limit 1;
   else
    select v into trace from jsonb_array_elements(coalesce(r.payload->'parser_template_evaluations','[]')) v
    where v->>'template_id'=t.id::text and v->>'algorithm_version'='3'
     and v->>'template_version'=t.template_version::text limit 1;
   end if;
   if trace is not null and r.created_at>t.shadow_started_at then
    stage:=case when coalesce(trace->>'status',trace->>'template_status')='active' then 'active' else 'shadow' end;
   end if;
   outcome:=case when truth is null or (r.ocr_normalized_text is null and t.template_type not in ('strip_prefix','strip_suffix','character_filter')) then 'unresolved_missing_context'
    when result->>'outcome'='unresolved_missing_context' then 'unresolved_missing_context'
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
   insert into public.finance_template_evidence(template_id,user_id,candidate_id,intake_item_id,correction_id,outcome,algorithm_version,evaluation_stage,template_version,value_hash)
   values(t.id,t.user_id,r.candidate_id,r.intake_item_id,
    (select c.id from public.finance_corrections c where c.user_id=t.user_id and c.transaction_id=r.transaction_id
     and c.field_name=case when t.field_name='recipient_reference' then 'notes' else t.field_name end order by c.created_at desc,c.id desc limit 1),
    outcome,3,stage,t.template_version,case when result->>'outcome'='value' then public.finance_template_value_hash_v2(t.field_name,result->>'value') end)
   on conflict(template_id,candidate_id) where candidate_id is not null
   do update set correction_id=excluded.correction_id,outcome=excluded.outcome,evaluation_stage=excluded.evaluation_stage,
    template_version=excluded.template_version,value_hash=excluded.value_hash
   where (finance_template_evidence.correction_id,finance_template_evidence.outcome,finance_template_evidence.evaluation_stage,finance_template_evidence.value_hash)
    is distinct from (excluded.correction_id,excluded.outcome,excluded.evaluation_stage,excluded.value_hash);
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
    where p.user_id=t.user_id and p.field_name<>'source_id' and p.algorithm_version in (2,3) and p.status in ('active','shadow'))<1000) then
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
  select t.algorithm_version in (2,3) and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id) and t.status='shadow' and t.contradiction_count=0 and t.precision=1 and t.evidence_count>=3
   and t.field_name<>'amount' and s.is_archived=false
   and t.evaluation_count>=least(5,(select count(*) from public.finance_template_evidence e where e.template_id=t.id))
   and (select count(distinct c.confirmed_transaction_id)
    from public.finance_template_evidence e join public.finance_candidate_transactions c on c.id=e.candidate_id and c.user_id=e.user_id
    where e.template_id=t.id and e.evaluation_stage='shadow' and e.outcome='supported' and c.created_at>t.shadow_started_at)>=3
   and not exists(select 1 from public.finance_template_evidence e where e.template_id=t.id and e.outcome in ('contradicted','invalid_output'))
   and not exists(select 1 from public.finance_template_evidence e join public.finance_intake_items i on i.id=e.intake_item_id and i.user_id=e.user_id
    where e.template_id=t.id and t.field_name<>'source_id' and not public.finance_receipt_format_matches(t.scope_receipt_format,i.receipt_format))
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


notify pgrst,'reload schema';
