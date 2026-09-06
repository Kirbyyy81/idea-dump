-- Deploy compatible application and OCR runtimes before refreshing these new pattern types.
create or replace function public.finance_parser_template_configuration_is_valid(
  p_configuration jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  configuration_type text;
  phrase_count integer;
  distinct_phrase_count integer;
begin
  if pg_catalog.jsonb_typeof(p_configuration) <> 'object' then
    return false;
  end if;

  configuration_type := p_configuration ->> 'type';

  if configuration_type = 'source_phrase' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'phrase', 'location']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'phrase')) between 1 and 120
      and p_configuration ->> 'location' in ('filename', 'ocr_line', 'header', 'footer');
  elsif configuration_type = 'filename_date' then
    return public.finance_jsonb_has_exact_keys(p_configuration,array['type','relative_day']) and p_configuration->>'relative_day'='today';
  elsif configuration_type = 'reference_label' then
    return public.finance_jsonb_has_exact_keys(p_configuration,array['type','label','placement','max_lines','join'])
      and p_configuration->>'label' in ('wallet ref','reference id','reference no','transaction no')
      and p_configuration->>'placement' in ('inline','before','after') and p_configuration->>'join' in ('space','concat')
      and jsonb_typeof(p_configuration->'max_lines')='number' and p_configuration->>'max_lines' ~ '^[1-3]$';
  elsif configuration_type = 'same_line_label' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'label'])
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'label')) between 1 and 120;
  elsif configuration_type = 'next_non_empty_line' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'label', 'max_lines']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'label')) between 1 and 120
      and pg_catalog.jsonb_typeof(p_configuration -> 'max_lines') = 'number'
      and p_configuration ->> 'max_lines' ~ '^[1-3]$'
      and (p_configuration ->> 'max_lines')::integer between 1 and 3;
  elsif configuration_type = 'bounded_line_window' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'anchor', 'direction', 'max_lines']
    )
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'anchor')) between 1 and 120
      and p_configuration ->> 'direction' in ('before', 'after')
      and pg_catalog.jsonb_typeof(p_configuration -> 'max_lines') = 'number'
      and p_configuration ->> 'max_lines' ~ '^[1-3]$'
      and (p_configuration ->> 'max_lines')::integer between 1 and 3;
  elsif configuration_type = 'allowlisted_regex_capture' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'pattern_id', 'anchor']
    )
      and p_configuration ->> 'pattern_id' in (
        'reference_token',
        'iso_date',
        'day_first_numeric_date',
        'day_first_named_date',
        'myr_amount'
      )
      and (
        p_configuration -> 'anchor' = 'null'::jsonb
        or (
          pg_catalog.jsonb_typeof(p_configuration -> 'anchor') = 'string'
          and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'anchor')) between 1 and 120
        )
      );
  elsif configuration_type in ('strip_prefix', 'strip_suffix') then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'value'])
      and pg_catalog.char_length(pg_catalog.btrim(p_configuration ->> 'value')) between 1 and 120;
  elsif configuration_type = 'character_filter' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'mode'])
      and p_configuration ->> 'mode' in ('digits_only', 'alphanumeric_only');
  elsif configuration_type = 'date_format' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'input_format'])
      and p_configuration ->> 'input_format' in (
        'yyyy-mm-dd',
        'dd/mm/yyyy',
        'dd-mm-yyyy',
        'dd.mm.yyyy',
        'dd mmm yyyy'
      );
  elsif configuration_type = 'numeric_separator' then
    return public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'decimal_separator', 'grouping_separator']
    )
      and p_configuration ->> 'decimal_separator' in ('.', ',')
      and (
        p_configuration -> 'grouping_separator' = 'null'::jsonb
        or p_configuration ->> 'grouping_separator' in ('.', ',', ' ')
      )
      and (
        p_configuration -> 'grouping_separator' = 'null'::jsonb
        or p_configuration ->> 'grouping_separator' <> p_configuration ->> 'decimal_separator'
      );
  elsif configuration_type = 'direction_phrase' then
    if not public.finance_jsonb_has_exact_keys(
      p_configuration,
      array['type', 'phrases', 'direction']
    )
      or pg_catalog.jsonb_typeof(p_configuration -> 'phrases') <> 'array'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_configuration -> 'phrases') as phrase(value)
        where pg_catalog.jsonb_typeof(phrase.value) <> 'string'
      )
      or p_configuration ->> 'direction' not in ('expense', 'income') then
      return false;
    end if;

    select
      pg_catalog.count(*)::integer,
      pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(phrases.value)))::integer
    into phrase_count, distinct_phrase_count
    from pg_catalog.jsonb_array_elements_text(p_configuration -> 'phrases') as phrases(value)
    where pg_catalog.char_length(pg_catalog.btrim(phrases.value)) between 1 and 120;

    return phrase_count between 1 and 10
      and phrase_count = pg_catalog.jsonb_array_length(p_configuration -> 'phrases')
      and phrase_count = distinct_phrase_count;
  elsif configuration_type = 'saved_payee_match' then
    return public.finance_jsonb_has_exact_keys(p_configuration, array['type', 'normalization'])
      and p_configuration ->> 'normalization' = 'canonical';
  end if;

  return false;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$function$;

alter table public.finance_parser_templates drop constraint finance_parser_templates_type_check, drop constraint finance_parser_templates_field_type_check,
add constraint finance_parser_templates_type_check
    check (template_type in (
      'source_phrase',
      'same_line_label',
      'next_non_empty_line',
      'bounded_line_window',
      'allowlisted_regex_capture',
      'strip_prefix',
      'strip_suffix',
      'character_filter',
      'date_format',
      'numeric_separator',
      'direction_phrase',
      'saved_payee_match','filename_date','reference_label'
    )),
  add constraint finance_parser_templates_field_type_check
    check (
      (template_type = 'source_phrase' and field_name = 'source_id')
      or (template_type in ('same_line_label', 'next_non_empty_line', 'bounded_line_window') and field_name <> 'source_id')
      or (template_type = 'allowlisted_regex_capture' and field_name in ('reference_number', 'transaction_date', 'recipient_reference', 'amount'))
      or (template_type in ('strip_prefix', 'strip_suffix', 'character_filter') and field_name = 'reference_number')
      or (template_type = 'date_format' and field_name = 'transaction_date')
      or (template_type = 'numeric_separator' and field_name = 'amount')
      or (template_type = 'direction_phrase' and field_name = 'direction')
      or (template_type = 'saved_payee_match' and field_name = 'payee_name')
      or (template_type = 'filename_date' and field_name = 'transaction_date')
      or (template_type = 'reference_label' and field_name = 'reference_number')
    );

create function public.finance_receipt_today_v2(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $fn$
 select exists(select 1 from unnest(public.finance_template_lines_v2(p_text)) l(line)
  where line ~* '^today(?:,?\s+(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?:\s*[ap]m)?)?$');
$fn$;
create function public.finance_screenshot_date_v2(p_filename text) returns text
language plpgsql immutable security invoker set search_path='' as $fn$
declare parts text[];
begin
 parts:=regexp_match(regexp_replace(coalesce(p_filename,''),'^.*[\\/]',''),
  '^Screenshot[_ -](20[0-9]{2})[-_]?([01][0-9])[-_]?([0-3][0-9])[_ -]([0-2][0-9])[-_:]?([0-5][0-9])[-_:]?([0-5][0-9])(?:[_ .-]|$)','i');
 if parts is null or parts[4]::int>23 then return null; end if;
 return make_date(parts[1]::int,parts[2]::int,parts[3]::int)::text;
exception when datetime_field_overflow then return null;
end;
$fn$;
create function public.finance_reference_chunk_v2(p_line text) returns text
language plpgsql immutable security invoker set search_path='' as $fn$
declare parts text[];
begin
 parts:=regexp_match(upper(p_line),'^(?:[^A-Z0-9]|[0-9] )*([A-Z0-9-]{5,200})$');
 return case when parts is not null and parts[1] ~ '[0-9]' then parts[1] end;
end;
$fn$;
create function public.finance_receipt_reference_v2(p_text text,p_config jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $fn$
declare lines text[]:=public.finance_template_lines_v2(p_text); vals text[]:=array[]::text[]; chunks text[];
 i int; j int; step int; tail text; chunk text; value text; matched boolean:=false;
begin
 for i in 1..cardinality(lines) loop
  if not starts_with(lower(lines[i]),p_config->>'label') then continue; end if;
  tail:=substr(lower(lines[i]),length(p_config->>'label')+1);
  if tail<>'' and tail !~ '^[\s:.-]' then continue; end if;
  tail:=regexp_replace(tail,'^[\s:.-]+','');
  if (p_config->>'placement'='inline')<>(tail<>'') then continue; end if;
  matched:=true; chunks:=array[]::text[];
  if tail<>'' then
   chunk:=public.finance_reference_chunk_v2(tail); if chunk is null then continue; end if;
   chunks:=array_append(chunks,chunk);
  end if;
  step:=case when p_config->>'placement'='before' then -1 else 1 end; j:=i+step;
  while j>=1 and j<=cardinality(lines) and abs(j-i)<=6 and cardinality(chunks)<(p_config->>'max_lines')::int loop
   if lines[j]<>'' then
    chunk:=public.finance_reference_chunk_v2(lines[j]); if chunk is null then exit; end if;
    chunks:=array_append(chunks,chunk);
   end if;
   j:=j+step;
  end loop;
  if cardinality(chunks)<>(p_config->>'max_lines')::int then continue; end if;
  if step=-1 then select array_agg(v order by n desc) into chunks from unnest(chunks) with ordinality x(v,n); end if;
  value:=array_to_string(chunks,case when p_config->>'join'='space' then ' ' else '' end);
  if length(value)<=200 and left(value,1)<>'-' and right(value,1)<>'-' and not value=any(vals) then vals:=array_append(vals,value); end if;
 end loop;
 return jsonb_build_object('outcome',case when cardinality(vals)=1 then 'value' when matched then 'invalid_output' else 'not_applicable' end,
  'value',case when cardinality(vals)=1 then vals[1] end);
end;
$fn$;
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
 if p_field='transaction_date' and typ='filename_date' then
  if not public.finance_receipt_today_v2(p_text) then return jsonb_build_object('outcome','not_applicable'); end if;
  value:=public.finance_screenshot_date_v2(p_filename);
  return jsonb_build_object('outcome',case when value is null then 'invalid_output' else 'value' end,'value',value);
 elsif p_field='reference_number' and typ='reference_label' then
  return public.finance_receipt_reference_v2(p_text,p_config);
 elsif p_field='source_id' and typ='source_phrase' then
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


create function public.finance_parser_receipt_configs_v2(p_field text,p_text text,p_corrected text,p_filename text,p_payees jsonb)
returns setof jsonb language plpgsql immutable security invoker set search_path='' as $fn$
declare cfg jsonb; result jsonb;
begin
 return query select * from public.finance_parser_candidate_configs_v2(p_field,p_text,p_corrected,p_payees);
 if p_field='transaction_date' and public.finance_receipt_today_v2(p_text) and public.finance_screenshot_date_v2(p_filename)=p_corrected then
  return next '{"type":"filename_date","relative_day":"today"}'::jsonb;
 elsif p_field='reference_number' then
  for cfg in select jsonb_build_object('type','reference_label','label',label,'placement',placement,'max_lines',n,'join',joiner)
   from unnest(array['wallet ref','reference id','reference no','transaction no']) l(label)
   cross join unnest(array['inline','before','after']) p(placement) cross join generate_series(1,3) x(n)
   cross join unnest(array['concat','space']) j(joiner) where n>1 or joiner='concat'
  loop
   result:=public.finance_receipt_reference_v2(p_text,cfg);
   if result->>'outcome'='value' and public.finance_template_value_hash_v2(p_field,result->>'value')
    =public.finance_template_value_hash_v2(p_field,public.finance_template_value_v2(p_field,p_corrected)) then return next cfg; end if;
  end loop;
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


revoke all on function public.finance_receipt_today_v2(text),public.finance_screenshot_date_v2(text),public.finance_reference_chunk_v2(text),
 public.finance_receipt_reference_v2(text,jsonb),public.finance_parser_receipt_configs_v2(text,text,text,text,jsonb) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
