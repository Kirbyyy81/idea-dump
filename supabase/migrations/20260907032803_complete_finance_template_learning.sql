-- Deploy compatible application and OCR runtimes before applying this migration.
-- Algorithm 2 definitions and evidence are retained. Amount learning remains deferred.
alter table public.finance_parser_templates
 drop constraint finance_parser_templates_version_check,
 add constraint finance_parser_templates_version_check check (algorithm_version in (1,2,3) and template_version>=1),
 add constraint finance_parser_templates_v3_types_check check (algorithm_version<>3 or (
  field_name not in ('source_id','amount') and template_type in (
   'bounded_line_window','allowlisted_regex_capture','strip_prefix','strip_suffix','character_filter','date_format')));
alter table public.finance_template_evidence
 drop constraint finance_template_evidence_algorithm_version_check,
 add constraint finance_template_evidence_algorithm_version_check check (algorithm_version in (1,2,3));
alter table public.finance_learning_runs
 drop constraint finance_learning_runs_algorithm_version_check,
 add constraint finance_learning_runs_algorithm_version_check check (algorithm_version in (1,2,3));

alter table public.finance_parser_templates add constraint finance_parser_templates_id_version_key unique(id,template_version);
alter table public.finance_template_evidence
 add column template_version integer,
 add column value_hash text,
 add constraint finance_template_evidence_v3_version_check check (algorithm_version<>3 or (template_version is not null and template_version>=1)),
 add constraint finance_template_evidence_value_hash_check check (value_hash is null or value_hash ~ '^[0-9a-f]{64}$'),
 add constraint finance_template_evidence_version_fkey foreign key(template_id,template_version)
  references public.finance_parser_templates(id,template_version) on delete cascade;

create function public.finance_evaluate_parser_template_v3(
 p_field text,p_config jsonb,p_text text,p_payees jsonb default '[]',p_baseline jsonb default null
) returns jsonb language plpgsql immutable security invoker set search_path='' as $fn$
<<evaluate>>
declare typ text:=p_config->>'type'; lines text[]:=public.finance_template_lines_v2(p_text);
 line text; scope text; anchor text; pattern text; pattern_id text; raw text; value text;
 original text; affix text; pos int; off int; i int; j int; n int; consumed int;
 matched boolean:=false; values_found text[]:=array[]::text[]; matches text[]; token text[];
 month text:='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
begin
 if p_field is null or p_field not in ('reference_number','merchant','transaction_date','direction','payee_name','notes','recipient_reference')
  or octet_length(p_config::text)>4096 or not coalesce(public.finance_parser_template_configuration_is_valid(p_config),false)
  then return jsonb_build_object('outcome','invalid_output'); end if;
 if typ in ('strip_prefix','strip_suffix','character_filter') then
  if p_field<>'reference_number' then return jsonb_build_object('outcome','invalid_output'); end if;
  if p_baseline is null or not coalesce(p_baseline ? 'reference_number',false) then
   return jsonb_build_object('outcome','unresolved_missing_context'); end if;
  if p_baseline->'reference_number'='null'::jsonb then return jsonb_build_object('outcome','not_applicable'); end if;
  if jsonb_typeof(p_baseline->'reference_number')<>'string' then return jsonb_build_object('outcome','invalid_output'); end if;
  original:=public.finance_template_value_v2(p_field,p_baseline->>'reference_number');
  if original is null then return jsonb_build_object('outcome','invalid_output'); end if;
  if typ='character_filter' then
   raw:=regexp_replace(original,case when p_config->>'mode'='digits_only' then '[^0-9]' else '[^A-Z0-9]' end,'','g');
  else
   affix:=upper(public.finance_template_text_v2(p_config->>'value'));
   if typ='strip_prefix' and starts_with(original,affix) then raw:=substr(original,length(affix)+1);
   elsif typ='strip_suffix' and right(original,length(affix))=affix then raw:=left(original,length(original)-length(affix));
   else return jsonb_build_object('outcome','not_applicable'); end if;
  end if;
  value:=public.finance_template_value_v2(p_field,raw);
  return jsonb_build_object('outcome',case when value is null then 'invalid_output' when value=original then 'not_applicable' else 'value' end,
   'value',case when value<>original then value end);
 end if;
 if typ='bounded_line_window' then
  anchor:=lower(public.finance_template_text_v2(p_config->>'anchor'));
  for i in 1..cardinality(lines) loop
   if position(anchor in lower(public.finance_template_text_v2(lines[i])))=0 then continue; end if;
   matched:=true;
   for n in 1..(p_config->>'max_lines')::int loop
    j:=i+case when p_config->>'direction'='before' then -n else n end;
    if j<1 or j>cardinality(lines) then continue; end if;
    raw:=public.finance_template_text_v2(lines[j]);
    if raw='' then continue; end if;
    value:=public.finance_template_value_v2(p_field,raw);
    if p_field='payee_name' and value is not null then
     select array_agg(p->>'name') into matches from jsonb_array_elements(p_payees) p
      where not coalesce((p->>'is_archived')::boolean,false)
       and p->>'normalized_name'=finance_private.finance_normalize_payee_key(evaluate.value);
     value:=case when cardinality(matches)=1 then public.finance_template_value_v2(p_field,matches[1]) end;
    end if;
    if value is not null and not value=any(values_found) then values_found:=array_append(values_found,value); end if;
   end loop;
  end loop;
 elsif typ in ('allowlisted_regex_capture','date_format') then
  pattern_id:=case when typ='date_format' then p_config->>'input_format' else p_config->>'pattern_id' end;
  if (pattern_id='reference_token' and p_field not in ('reference_number','recipient_reference'))
   or (pattern_id<>'reference_token' and p_field<>'transaction_date') then return jsonb_build_object('outcome','invalid_output'); end if;
  pattern:=case pattern_id
   when 'reference_token' then '[A-Za-z0-9-]+'
   when 'iso_date' then '20[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}'
   when 'day_first_numeric_date' then '(?:[0-9]{1,2}/[0-9]{1,2}/20[0-9]{2}|[0-9]{1,2}-[0-9]{1,2}-20[0-9]{2}|[0-9]{1,2}\.[0-9]{1,2}\.20[0-9]{2})'
   when 'day_first_named_date' then '[0-9]{1,2} '||month||' 20[0-9]{2}'
   when 'yyyy-mm-dd' then '20[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}'
   when 'dd/mm/yyyy' then '[0-9]{1,2}/[0-9]{1,2}/20[0-9]{2}'
   when 'dd-mm-yyyy' then '[0-9]{1,2}-[0-9]{1,2}-20[0-9]{2}'
   when 'dd.mm.yyyy' then '[0-9]{1,2}\.[0-9]{1,2}\.20[0-9]{2}'
   when 'dd mmm yyyy' then '[0-9]{1,2} '||month||' 20[0-9]{2}' end;
  if pattern is null then return jsonb_build_object('outcome','invalid_output'); end if;
  anchor:=case when typ='allowlisted_regex_capture' then nullif(lower(public.finance_template_text_v2(p_config->>'anchor')),'') end;
  foreach line in array lines loop
   line:=public.finance_template_text_v2(line); off:=1;
   loop
    if anchor is not null then
     pos:=position(anchor in lower(substr(line,off)));
     exit when pos=0;
     off:=off+pos-1+length(anchor); scope:=substr(line,off); matched:=true;
    else scope:=line; end if;
    consumed:=0;
    -- substring's non-capturing outer group keeps the full internal pattern match.
    loop
     raw:=substring(substr(scope,consumed+1) from '(?i)(?:'||pattern||')');
     exit when raw is null;
     pos:=position(lower(raw) in lower(substr(scope,consumed+1)))+consumed;
     i:=pos+length(raw);
     if (pos=1 or substr(scope,pos-1,1) !~ '[[:alnum:]_./-]')
      and (i>length(scope) or substr(scope,i,1) !~ '[[:alnum:]_./-]') then
      if pattern_id<>'reference_token' or raw ~ '[0-9]' then
       matched:=true;
       if pattern_id<>'reference_token' or (length(raw)>=5 and left(raw,1)<>'-' and right(raw,1)<>'-') then
        value:=public.finance_template_value_v2(p_field,raw);
        if value is not null and not value=any(values_found) then values_found:=array_append(values_found,value); end if;
       end if;
      end if;
     end if;
     consumed:=i-1;
    end loop;
    exit when anchor is null;
   end loop;
  end loop;
 else return jsonb_build_object('outcome','not_applicable');
 end if;
 return jsonb_build_object('outcome',case when cardinality(values_found)=1 then 'value'
  when matched then 'invalid_output' else 'not_applicable' end,
  'value',case when cardinality(values_found)=1 then values_found[1] end);
end;
$fn$;

create function public.finance_parser_candidate_configs_v3(
 p_field text,p_text text,p_corrected text,p_payees jsonb,p_baseline jsonb
) returns setof jsonb language plpgsql immutable security invoker set search_path='' as $fn$
declare labels text[]; label text; cfg jsonb; result jsonb; configs jsonb[]:=array[]::jsonb[];
 pattern text; direction text; fmt text; original text; corrected text; affix text; n int;
begin
 labels:=case p_field
 when 'reference_number' then array['reference','reference number','ref','transaction id','transaction reference','receipt number','order id','invoice number']
 when 'merchant' then array['merchant','merchant name','store','shop','seller','biller','paid to','payment to']
 when 'transaction_date' then array['date','transaction date','payment date','transfer date','receipt date']
 when 'payee_name' then array['payee','payee name','recipient','recipient name','paid to','payment to','beneficiary','to']
 when 'notes' then array['notes','note','message','payment details','remarks','description']
 when 'recipient_reference' then array['recipient reference','recipient ref']
 else array[]::text[] end;
 foreach label in array labels loop
  foreach direction in array array['before','after'] loop
   for n in 1..3 loop
    configs:=array_append(configs,jsonb_build_object('type','bounded_line_window','anchor',label,'direction',direction,'max_lines',n));
   end loop;
  end loop;
 end loop;
 foreach pattern in array case when p_field in ('reference_number','recipient_reference') then array['reference_token']
  when p_field='transaction_date' then array['iso_date','day_first_numeric_date','day_first_named_date'] else array[]::text[] end loop
  configs:=array_append(configs,jsonb_build_object('type','allowlisted_regex_capture','pattern_id',pattern,'anchor',null));
  foreach label in array labels loop
   configs:=array_append(configs,jsonb_build_object('type','allowlisted_regex_capture','pattern_id',pattern,'anchor',label));
  end loop;
 end loop;
 if p_field='transaction_date' then
  foreach fmt in array array['yyyy-mm-dd','dd/mm/yyyy','dd-mm-yyyy','dd.mm.yyyy','dd mmm yyyy'] loop
   configs:=array_append(configs,jsonb_build_object('type','date_format','input_format',fmt));
  end loop;
 elsif p_field='reference_number' then
  original:=public.finance_template_value_v2(p_field,p_baseline->>'reference_number');
  corrected:=public.finance_template_value_v2(p_field,p_corrected);
  if length(original)>length(corrected) then
   foreach direction in array array['prefix','suffix'] loop
    affix:=case when direction='prefix' and right(original,length(corrected))=corrected then left(original,length(original)-length(corrected))
     when direction='suffix' and starts_with(original,corrected) then substr(original,length(corrected)+1) end;
    -- Bounded stable alphabetic/punctuation affixes only. Never persist numeric transaction content.
    if length(affix) between 1 and 120 and affix ~ '^[A-Z .:_/-]+$' and affix ~ '[A-Z]' then
     configs:=array_append(configs,jsonb_build_object('type','strip_'||direction,'value',affix));
    end if;
   end loop;
  end if;
  configs:=array_append(configs,'{"type":"character_filter","mode":"digits_only"}');
  configs:=array_append(configs,'{"type":"character_filter","mode":"alphanumeric_only"}');
 end if;
 foreach cfg in array configs loop
  result:=public.finance_evaluate_parser_template_v3(p_field,cfg,p_text,p_payees,p_baseline);
  if result->>'outcome'='value' and (
   (p_field='recipient_reference' and result->>'value'=any(regexp_split_to_array(coalesce(p_corrected,''),E'\\r?\\n')))
   or (p_field<>'recipient_reference' and public.finance_template_value_hash_v2(p_field,result->>'value')
    =public.finance_template_value_hash_v2(p_field,public.finance_template_value_v2(p_field,p_corrected)))
  ) then return next cfg; end if;
 end loop;
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
   tx.source_id,i.ocr_normalized_text,i.original_filename,accepted.payload->'parser_template_baseline' baseline,
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
  select f.user_id,f.source_id,f.field,f.transaction_id,cfg
  from field_inputs f cross join lateral public.finance_parser_candidate_configs_v3(f.field,f.ocr_normalized_text,f.corrected,f.payees,f.baseline) cfg
 ), grouped as (
  select user_id,source_id,field,cfg,count(distinct transaction_id) support
  from configs group by user_id,source_id,field,cfg having count(distinct transaction_id)>=3
 ), ranked as (
  select *,row_number() over(partition by user_id,source_id,field order by support desc,cfg::text) rank from grouped
 )
 insert into public.finance_parser_templates(
  user_id,template_key,target_source_id,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at,predecessor_template_id)
 select x.user_id,'v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text),
  case when x.field='source_id' then x.source_id end,case when x.field<>'source_id' then x.source_id end,
  x.field,x.cfg->>'type',x.cfg,3,
  coalesce((select max(old.template_version) from public.finance_parser_templates old
   where old.user_id=x.user_id and old.algorithm_version=3
    and old.template_key='v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text)),0)+1,
  'proposed',finance_private.finance_parser_learning_cutoff(x.user_id),
  (select old.id from public.finance_parser_templates old where old.user_id=x.user_id
   and coalesce(old.scope_source_id,old.target_source_id)=x.source_id and old.field_name=x.field
   and old.configuration=x.cfg and old.algorithm_version in (1,2,3) order by old.algorithm_version desc,old.template_version desc,old.id limit 1)
 from ranked x where rank<=20 and not exists(
  select 1 from public.finance_parser_templates old where old.user_id=x.user_id and old.algorithm_version=3
   and old.template_key='v3:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text)
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
   result:=public.finance_evaluate_parser_template_v3(t.field_name,t.configuration,r.ocr_normalized_text,r.payees,r.payload->'parser_template_baseline');
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
  select f.user_id,f.source_id,f.field,f.transaction_id,cfg
  from field_inputs f cross join lateral public.finance_parser_receipt_configs_v2(f.field,f.ocr_normalized_text,f.corrected,f.original_filename,f.payees) cfg
  union all
  select l.user_id,l.source_id,'source_id',l.transaction_id,cfg
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
    new.shadow_started_at := pg_catalog.clock_timestamp();
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
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':parser_runtime_capacity',1));
    if new.field_name<>'source_id' and (select count(*) from public.finance_parser_templates p
      where p.user_id=new.user_id and p.id<>new.id and p.algorithm_version in (2,3)
       and p.field_name<>'source_id' and p.status in ('active','shadow'))>=1000 then
      raise exception using errcode='23514', message='Parser template runtime user limit exceeded';
    end if;
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
      and (new.field_name = 'source_id' or templates.scope_source_id = new.scope_source_id)
      and templates.status in ('active', 'shadow')
      and templates.id <> new.id;

    if active_scope_count >= (case when new.field_name = 'source_id' then 40 else 20 end) then
      raise exception using errcode = '23514', message = 'Parser template runtime scope limit exceeded';
    end if;
  end if;

  if new.status = 'active' and old.status is distinct from new.status
     and not public.finance_parser_template_can_promote_v2(new.id) then
    raise exception using errcode = '23514', message = 'Reviewed shadow evidence and operator promotion are required';
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

create or replace function finance_private.finance_guard_parser_learning_cutoff() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
 if tg_op='UPDATE' and new.learning_cutoff_at is distinct from old.learning_cutoff_at then
  raise exception using errcode='23514',message='Template learning cutoff is immutable';
 end if;
 if new.algorithm_version in (2,3) and (tg_op='INSERT' or new.status in ('active','shadow'))
  and new.learning_cutoff_at<>finance_private.finance_parser_learning_cutoff(new.user_id) then
  raise exception using errcode='23514',message='Template belongs to an earlier learning period';
 end if;
 return new;
end;
$fn$;

create or replace function public.finance_set_parser_learning_cutoff(p_user_id uuid,p_eligible_from timestamptz) returns boolean
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
 where user_id=p_user_id and algorithm_version in (2,3) and status='active';
 get diagnostics disabled_count=row_count;
 update public.finance_parser_templates set status='rejected',status_reason='learning_cutoff_changed'
 where user_id=p_user_id and algorithm_version in (2,3) and status in ('proposed','shadow');
 get diagnostics rejected_count=row_count;
 insert into finance_private.finance_parser_learning_settings(user_id,eligible_from)
 values(p_user_id,p_eligible_from) on conflict(user_id) do update set eligible_from=excluded.eligible_from,updated_at=clock_timestamp();
 insert into public.finance_learning_runs(invocation_id,algorithm_version,status,finished_at,templates_disabled,templates_rejected)
 values(gen_random_uuid(),3,'succeeded',clock_timestamp(),disabled_count,rejected_count);
 return true;
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

create or replace function public.finance_disable_parser_template_v2(p_template_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $fn$
declare changed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
 update public.finance_parser_templates set status='disabled',status_reason='operator_disabled'
 where id=p_template_id and algorithm_version in (2,3) and status='active';
 changed:=found;
 insert into public.finance_learning_runs(invocation_id,algorithm_version,status,finished_at,templates_disabled)
 values(gen_random_uuid(),3,'succeeded',clock_timestamp(),case when changed then 1 else 0 end);
 return changed;
end;
$fn$;

create or replace function public.finance_requeue_parser_template_v2(p_template_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $fn$
declare invocation uuid:=gen_random_uuid(); changed boolean;
begin
 perform public.finance_refresh_rule_suggestions(invocation);
 if not exists(select 1 from public.finance_learning_runs where invocation_id=invocation and status='succeeded') then return false; end if;
 update public.finance_parser_templates t set status='shadow',status_reason=null
 from public.dim_finance_sources s
 where t.id=p_template_id and t.algorithm_version in (2,3) and t.learning_cutoff_at=finance_private.finance_parser_learning_cutoff(t.user_id) and t.status='disabled'
  and s.id=coalesce(t.scope_source_id,t.target_source_id) and s.user_id=t.user_id and not s.is_archived
  and t.evidence_count>=3 and t.contradiction_count=0 and t.precision=1;
 changed:=found;
 if changed then
  update public.finance_learning_runs set templates_shadowed=templates_shadowed+1 where invocation_id=invocation;
 end if;
 return changed;
end;
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
    select jsonb_object_agg(v2.key,(v2.value::int+v3.value::int))
     into template_result from jsonb_each_text(template_result) v2
     join jsonb_each_text(public.finance_refresh_parser_templates_v3(run_row.id)) v3 on v3.key=v2.key;
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
      where algorithm_version in (2,3) and learning_cutoff_at=finance_private.finance_parser_learning_cutoff(user_id) and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict')
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

revoke all on function public.finance_evaluate_parser_template_v3(text,jsonb,text,jsonb,jsonb),
 public.finance_parser_candidate_configs_v3(text,text,text,jsonb,jsonb),
 public.finance_refresh_parser_templates_v3(uuid) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
