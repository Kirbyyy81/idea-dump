-- Version 2 uses bounded, replayable parsing and explicit operator promotion.
alter table public.finance_parser_templates
  drop constraint finance_parser_templates_version_check,
  add constraint finance_parser_templates_version_check check (algorithm_version in (1,2) and template_version >= 1),
  add column shadow_started_at timestamptz;
alter table public.finance_template_evidence
  drop constraint finance_template_evidence_algorithm_version_check,
  add constraint finance_template_evidence_algorithm_version_check check (algorithm_version in (1,2)),
  add column evaluation_stage text not null default 'historical'
    check (evaluation_stage in ('historical','shadow','active'));
alter table public.finance_learning_runs
  drop constraint finance_learning_runs_algorithm_version_check,
  add constraint finance_learning_runs_algorithm_version_check check (algorithm_version in (1,2)),
  add column candidates_evaluated integer not null default 0 check (candidates_evaluated >= 0),
  add column templates_updated integer not null default 0 check (templates_updated >= 0);

create or replace function public.finance_template_text_v2(p_text text) returns text
language sql immutable security invoker set search_path = '' as $fn$
 select btrim(regexp_replace(normalize(coalesce(p_text,''), NFKC), '[[:space:]]+', ' ', 'g'));
$fn$;
create or replace function public.finance_template_lines_v2(p_text text) returns text[]
language sql immutable security invoker set search_path = '' as $fn$
 select coalesce(array_agg(regexp_replace(line,'^[[:space:]]+|[[:space:]]+$','','g') order by n), array[]::text[])
 from unnest(regexp_split_to_array(left(normalize(coalesce(p_text,''), NFKC),20000), E'\\r?\\n'))
 with ordinality x(line,n) where n <= 200;
$fn$;
create or replace function public.finance_template_source_phrase_v2(p_text text) returns text
language sql immutable security invoker set search_path = '' as $fn$
 select btrim(regexp_replace(lower(public.finance_template_text_v2(p_text)), '[^a-z0-9]+',' ','g'));
$fn$;
create or replace function public.finance_template_text_length_v2(p_text text) returns integer
language sql immutable security invoker set search_path = '' as $fn$
 select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)::integer
 from regexp_split_to_table(coalesce(p_text,''),'') ch where ch<>'';
$fn$;
create or replace function public.finance_template_value_v2(p_field text, p_value text) returns text
language plpgsql immutable security invoker set search_path = '' as $fn$
declare v text := public.finance_template_text_v2(p_value); parts text[]; m integer;
begin
 if v='' or public.finance_template_text_length_v2(v)>(case when p_field='notes' then 2500 when p_field in ('merchant','payee_name') then 500 else 200 end) then return null; end if;
 if p_field='transaction_date' then
  parts := regexp_match(v,'^(20[0-9]{2})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})(?:[ T][0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?: ?(?:AM|PM))?)?$','i');
  if parts is not null then return make_date(parts[1]::int,parts[2]::int,parts[3]::int)::text; end if;
  parts := regexp_match(v,'^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.](20[0-9]{2})(?:[ T][0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?: ?(?:AM|PM))?)?$','i');
  if parts is not null then return make_date(parts[3]::int,parts[2]::int,parts[1]::int)::text; end if;
  parts := regexp_match(v,'^([0-9]{1,2}) (Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (20[0-9]{2})(?:[ T][0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?: ?(?:AM|PM))?)?$','i');
  if parts is null then return null; end if;
  m:=array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],lower(left(parts[2],3)));
  return make_date(parts[3]::int,m,parts[1]::int)::text;
 elsif p_field='direction' then return case when lower(v) in ('expense','income') then lower(v) end;
 elsif v !~ '[[:alnum:]]' then return null;
 elsif p_field='reference_number' then return case when public.finance_template_text_length_v2(upper(v))<=200 then upper(v) end;
 end if;
 return v;
exception when datetime_field_overflow or invalid_datetime_format then return null;
end;
$fn$;
create or replace function public.finance_template_value_hash_v2(p_field text,p_value text) returns text
language sql immutable security invoker set search_path = '' as $fn$
 select encode(sha256(convert_to(case
  when p_field='payee_name' then finance_private.finance_normalize_payee_key(p_value)
  when p_field='merchant' then lower(public.finance_template_text_v2(p_value))
  else public.finance_template_text_v2(p_value) end,'UTF8')),'hex');
$fn$;

-- All evaluators return a typed outcome. Missing context is never counted as support.
create or replace function public.finance_evaluate_parser_template_v2(
 p_field text,p_config jsonb,p_text text,p_filename text,p_payees jsonb default '[]'
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $fn$
<<evaluate>>
declare lines text[]:=public.finance_template_lines_v2(p_text);
 typ text:=p_config->>'type'; label text; tail text; value text; phrase text;
 i int; j int; n int; matched boolean:=false; matches text[]; normalized_lines text[];
begin
 if public.finance_parser_template_configuration_is_valid(p_config) is not true then
  return jsonb_build_object('outcome','invalid_output');
 end if;
 if p_field='source_id' and typ='source_phrase' then
  phrase:=public.finance_template_source_phrase_v2(p_config->>'phrase');
  if length(phrase)<3 then return jsonb_build_object('outcome','invalid_output'); end if;
  if p_config->>'location'='filename' then
   matched:=position(' '||phrase||' ' in ' '||public.finance_template_source_phrase_v2(p_filename)||' ')>0;
  else
   select coalesce(array_agg(v order by ord),array[]::text[]) into normalized_lines
   from (select public.finance_template_source_phrase_v2(line) v,ord from unnest(lines) with ordinality a(line,ord)) a where v<>'';
   if p_config->>'location'='header' then normalized_lines:=normalized_lines[1:3];
   elsif p_config->>'location'='footer' then normalized_lines:=normalized_lines[greatest(1,cardinality(normalized_lines)-2):cardinality(normalized_lines)]; end if;
   select coalesce(bool_or(position(' '||phrase||' ' in ' '||line||' ')>0),false) into matched from unnest(normalized_lines) a(line);
  end if;
  return jsonb_build_object('outcome',case when matched then 'value' else 'not_applicable' end);
 elsif typ='direction_phrase' and p_field='direction' then
  select exists(select 1 from unnest(lines) a(line), jsonb_array_elements_text(p_config->'phrases') p(phrase)
   where position(' '||public.finance_template_source_phrase_v2(p.phrase)||' ' in ' '||public.finance_template_source_phrase_v2(line)||' ')>0) into matched;
  if matched then value:=p_config->>'direction'; end if;
 elsif typ='saved_payee_match' and p_field='payee_name' then
  select array_agg(distinct p->>'name') into matches from jsonb_array_elements(p_payees) p
  where coalesce((p->>'is_archived')::boolean,false)=false and exists(select 1 from unnest(lines) a(line)
   where finance_private.finance_normalize_payee_key(line)=p->>'normalized_name');
  if cardinality(matches)=1 then value:=matches[1]; matched:=true;
  elsif cardinality(matches)>1 then matched:=true; end if;
 elsif typ in ('same_line_label','next_non_empty_line') then
  label:=lower(public.finance_template_text_v2(p_config->>'label'));
  for i in 1..cardinality(lines) loop
   tail:=public.finance_template_text_v2(lines[i]);
   if not starts_with(lower(tail),label) then continue; end if;
   tail:=substr(tail,length(label)+1);
   if tail<>'' and tail !~ '^(?:[[:space:]]*[:-][[:space:]]*|[[:space:]]+)' then continue; end if;
   tail:=regexp_replace(tail,'^[[:space:]]*[:-]?[[:space:]]*','');
   if typ='same_line_label' then
    if tail='' then continue; end if;
    matched:=true; value:=public.finance_template_value_v2(p_field,tail); exit;
   end if;
   if tail<>'' then continue; end if;
   matched:=true; n:=0;
   for j in i+1..least(cardinality(lines),i+6) loop
    if lines[j]='' then continue; end if;
    n:=n+1; value:=public.finance_template_value_v2(p_field,lines[j]);
    if p_field='payee_name' and value is not null then
     select array_agg(p->>'name') into matches from jsonb_array_elements(p_payees) p
     where coalesce((p->>'is_archived')::boolean,false)=false and p->>'normalized_name'=finance_private.finance_normalize_payee_key(evaluate.value);
     value:=case when cardinality(matches)=1 then public.finance_template_value_v2('payee_name',matches[1]) end;
    end if;
    exit when value is not null or n>=(p_config->>'max_lines')::int;
   end loop;
   exit when value is not null;
  end loop;
 else return jsonb_build_object('outcome','not_applicable');
 end if;
 if p_field='payee_name' and value is not null then
  select array_agg(p->>'name') into matches from jsonb_array_elements(p_payees) p
  where coalesce((p->>'is_archived')::boolean,false)=false and p->>'normalized_name'=finance_private.finance_normalize_payee_key(evaluate.value);
  value:=case when cardinality(matches)=1 then matches[1] end;
 end if;
 return jsonb_build_object('outcome',case when value is not null then 'value' when matched then 'invalid_output' else 'not_applicable' end,'value',value);
end;
$fn$;

create or replace function public.finance_parser_candidate_configs_v2(p_field text,p_text text,p_corrected text,p_payees jsonb)
returns setof jsonb language plpgsql immutable security invoker set search_path = '' as $fn$
declare labels text[]; label text; cfg jsonb; eval jsonb; direction text; phrase text; n int;
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
  for n in 0..3 loop
   cfg:=case when n=0 then jsonb_build_object('type','same_line_label','label',label)
    else jsonb_build_object('type','next_non_empty_line','label',label,'max_lines',n) end;
   eval:=public.finance_evaluate_parser_template_v2(p_field,cfg,p_text,null,p_payees);
   if eval->>'outcome'='value' and (
    (p_field='recipient_reference' and eval->>'value'=any(regexp_split_to_array(coalesce(p_corrected,''),E'\\r?\\n')))
    or (p_field<>'recipient_reference' and public.finance_template_value_hash_v2(p_field,eval->>'value')
     =public.finance_template_value_hash_v2(p_field,public.finance_template_value_v2(p_field,p_corrected)))
   ) then return next cfg; end if;
  end loop;
 end loop;
 if p_field='direction' and p_corrected in ('expense','income') then
  foreach phrase in array case when p_corrected='expense' then array['payment successful','transfer successful','you paid','money sent','debited']
   else array['money received','payment received','transfer received','credited','salary received'] end loop
   cfg:=jsonb_build_object('type','direction_phrase','phrases',jsonb_build_array(phrase),'direction',p_corrected);
   eval:=public.finance_evaluate_parser_template_v2(p_field,cfg,p_text,null,p_payees);
   if eval->>'outcome'='value' then return next cfg; end if;
  end loop;
 elsif p_field='payee_name' then
  cfg:='{"type":"saved_payee_match","normalization":"canonical"}';
  eval:=public.finance_evaluate_parser_template_v2(p_field,cfg,p_text,null,p_payees);
  if eval->>'outcome'='value' and public.finance_template_value_hash_v2(p_field,eval->>'value')
   =public.finance_template_value_hash_v2(p_field,p_corrected) then return next cfg; end if;
 end if;
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
  user_id,template_key,target_source_id,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,predecessor_template_id)
 select x.user_id,'v2:'||md5(x.source_id::text||':'||x.field||':'||x.cfg::text),
  case when x.field='source_id' then x.source_id end,case when x.field<>'source_id' then x.source_id end,
  x.field,x.cfg->>'type',x.cfg,2,1,'proposed',
  (select old.id from public.finance_parser_templates old where old.user_id=x.user_id
   and coalesce(old.scope_source_id,old.target_source_id)=x.source_id and old.field_name=x.field
   and old.configuration=x.cfg and old.algorithm_version=1 order by old.template_version desc,old.id limit 1)
 from ranked x where rank<=20
 on conflict(user_id,template_key,algorithm_version,template_version) do nothing;
 get diagnostics proposed_count=row_count;

 -- Replay every retained reviewed case. Do not use the runtime trace as a history filter.
 for t in select * from public.finance_parser_templates where algorithm_version=2 order by user_id,id loop
  delete from public.finance_template_evidence e
  where e.template_id=t.id and not exists(
   select 1 from public.finance_candidate_transactions c join public.finance_transactions tx on tx.id=c.confirmed_transaction_id and tx.user_id=c.user_id
   where c.id=e.candidate_id and c.user_id=t.user_id and c.status='accepted' and tx.status='confirmed'
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
   where c.user_id=t.user_id and c.status='accepted'
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
  select t.algorithm_version=2 and t.status='shadow' and t.contradiction_count=0 and t.precision=1 and t.evidence_count>=3
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
      where p.user_id=new.user_id and p.id<>new.id and p.algorithm_version=2
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
      where algorithm_version=2 and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict')
      group by user_id,status_reason
    ) reasons group by user_id
    on conflict(run_id,user_id) do update set reason_counts=excluded.reason_counts;
    update public.finance_learning_runs set
      templates_proposed=coalesce((template_result->>'proposed')::int,0),
      templates_updated=coalesce((template_result->>'updated')::int,0),
      templates_shadowed=coalesce((template_result->>'shadowed')::int,0),
      templates_disabled=coalesce((template_result->>'disabled')::int,0),
      templates_rejected=coalesce((template_result->>'rejected')::int,0),
      candidates_evaluated=(select count(distinct candidate_id) from public.finance_template_evidence where algorithm_version=2),
      reason_counts=coalesce((select jsonb_object_agg(reason,n) from (
        select status_reason reason,count(*) n from public.finance_parser_templates
        where algorithm_version=2 and status_reason in ('insufficient_evidence','contradiction','invalid_output','unresolved_missing_context','source_archived','conflict') group by status_reason
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


-- Prior versions remain explainable, but must be relearned before the new runtime uses them.
update public.finance_parser_templates set status='disabled',status_reason='algorithm_replaced'
where algorithm_version=1 and status='active';
update public.finance_parser_templates set status='rejected',status_reason='algorithm_replaced'
where algorithm_version=1 and status in ('proposed','shadow');

create or replace function public.finance_promote_parser_template_v2(p_template_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $fn$
declare invocation uuid:=gen_random_uuid(); run_id uuid;
begin
 perform public.finance_refresh_rule_suggestions(invocation);
 select id into run_id from public.finance_learning_runs where invocation_id=invocation and status='succeeded';
 if run_id is null then return false; end if;
 perform 1 from public.finance_parser_templates where id=p_template_id for update;
 if not public.finance_parser_template_can_promote_v2(p_template_id) then return false; end if;
 update public.finance_parser_templates set status='active',status_reason=null where id=p_template_id;
 update public.finance_learning_runs set templates_activated=templates_activated+1 where id=run_id;
 return true;
end;
$fn$;
create or replace function public.finance_disable_parser_template_v2(p_template_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $fn$
declare changed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
 update public.finance_parser_templates set status='disabled',status_reason='operator_disabled'
 where id=p_template_id and algorithm_version=2 and status='active';
 changed:=found;
 insert into public.finance_learning_runs(invocation_id,algorithm_version,status,finished_at,templates_disabled)
 values(gen_random_uuid(),2,'succeeded',clock_timestamp(),case when changed then 1 else 0 end);
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
 where t.id=p_template_id and t.algorithm_version=2 and t.status='disabled'
  and s.id=coalesce(t.scope_source_id,t.target_source_id) and s.user_id=t.user_id and not s.is_archived
  and t.evidence_count>=3 and t.contradiction_count=0 and t.precision=1;
 changed:=found;
 if changed then
  update public.finance_learning_runs set templates_shadowed=templates_shadowed+1 where invocation_id=invocation;
 end if;
 return changed;
end;
$fn$;

-- A function-local SET cannot arm the statement timer for its calling SELECT.
do $cron$
declare job_id bigint;
begin
 if to_regclass('cron.job') is not null then
  execute 'select jobid from cron.job where jobname=$1' into job_id using 'finance-rule-learning';
  if job_id is not null then
   execute 'select cron.alter_job($1, command := $2)' using job_id,
    'SET statement_timeout = ''90s''; SELECT public.finance_refresh_rule_suggestions();';
  end if;
 end if;
end;
$cron$;
do $privileges$
declare proc record;
begin
 for proc in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname in (
  'finance_template_text_v2','finance_template_lines_v2','finance_template_source_phrase_v2',
  'finance_template_text_length_v2','finance_template_value_v2','finance_template_value_hash_v2','finance_evaluate_parser_template_v2',
  'finance_parser_candidate_configs_v2','finance_refresh_parser_templates_v2',
  'finance_parser_template_can_promote_v2','finance_promote_parser_template_v2',
  'finance_disable_parser_template_v2','finance_requeue_parser_template_v2'
 ) or p.proname='finance_refresh_rule_suggestions') loop
  execute format('revoke execute on function %s from public, anon, authenticated, service_role',proc.signature);
 end loop;
end;
$privileges$;
notify pgrst, 'reload schema';
