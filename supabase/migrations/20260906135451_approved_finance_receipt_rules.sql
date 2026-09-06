-- Approved definitions remain opt-in per user and source; replay preserves contradictions.
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
  elsif configuration_type = 'receipt_pattern' then
    return public.finance_jsonb_has_exact_keys(p_configuration,array['type','pattern'])
      and p_configuration->>'pattern' in ('tng_date','ryt_date','signed_direction','tng_wallet_before','tng_wallet_wrapped');
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
      'saved_payee_match','filename_date','reference_label','receipt_pattern'
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
      or (template_type = 'receipt_pattern' and (
        (configuration->>'pattern' in ('tng_date','ryt_date') and field_name='transaction_date')
        or (configuration->>'pattern'='signed_direction' and field_name='direction')
        or (configuration->>'pattern' in ('tng_wallet_before','tng_wallet_wrapped') and field_name='reference_number')))
    );


create function public.finance_receipt_direction_conflict_v2(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $fn$
 select count(distinct value)>1 from (
  select case when line ~ '^\+' then 'income' else 'expense' end value from unnest(public.finance_template_lines_v2(p_text)) l(line)
   where line ~* '^[+-]\s*RM\s*[0-9][0-9,]*\.[0-9]{2}(?:\s|$)'
  union all
  select case when line ~* '^Transaction Type\s+Payment$' then 'expense' else 'income' end
  from unnest(public.finance_template_lines_v2(p_text)) l(line)
   where line ~* '^Transaction Type\s+(?:Payment|Receive from Wallet)$'
 ) evidence;
$fn$;
create function public.finance_approved_receipt_value_v2(p_text text,p_pattern text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $fn$
declare lines text[]:=public.finance_template_lines_v2(p_text); vals text[]:=array[]::text[]; parts text[];
 i int; j int; value text; next_line text; matched boolean:=false;
begin
 if p_pattern='signed_direction' then
  for i in 1..cardinality(lines) loop
   if lines[i] ~* '^[+-]\s*RM\s*[0-9][0-9,]*\.[0-9]{2}(?:\s|$)' then
    if public.finance_receipt_direction_conflict_v2(p_text) then return jsonb_build_object('outcome','invalid_output','value',null); end if;
    return jsonb_build_object('outcome','value','value',case when left(lines[i],1)='+' then 'income' else 'expense' end);
   end if;
  end loop;
  return jsonb_build_object('outcome','not_applicable','value',null);
 end if;
 for i in 1..cardinality(lines) loop
  value:=null;
  if p_pattern in ('tng_date','ryt_date') then
   parts:=case when p_pattern='tng_date' then regexp_match(lines[i],'^Date(?:/Time| & Time)\s+([0-9]{2}/[0-9]{2}/20[0-9]{2})(?:\s|$)','i')
    else regexp_match(lines[i],'^([0-9]{1,2} [A-Za-z]{3} 20[0-9]{2})(?:,|$)') end;
   if parts is null then continue; end if;
   matched:=true; value:=public.finance_template_value_v2('transaction_date',parts[1]);
  elsif p_pattern='tng_wallet_before' then
   if lines[i] !~* '^Wallet Ref(?:\s+[^A-Za-z]{0,5})?$' then continue; end if;
   if i>1 and lines[i-1] ~ '^[0-9]{20,200}$' then matched:=true; value:=lines[i-1]; end if;
  elsif p_pattern='tng_wallet_wrapped' then
   parts:=regexp_match(lines[i],'^Wallet Ref\s+([A-Za-z0-9]{20,200})$','i');
   if parts is null then continue; end if;
   next_line:='';
   for j in i+1..least(i+3,cardinality(lines)) loop if lines[j]<>'' then next_line:=lines[j]; exit; end if; end loop;
   if next_line !~ '^[0-9]{10,30}$' then continue; end if;
   matched:=true; value:=upper(parts[1]||' '||next_line); if length(value)>200 then value:=null; end if;
  end if;
  if value is not null and not value=any(vals) then vals:=array_append(vals,value); end if;
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
 if typ='receipt_pattern' then
  return public.finance_approved_receipt_value_v2(p_text,p_config->>'pattern');
 elsif p_field='transaction_date' and typ='filename_date' then
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
  if exists(select 1 from jsonb_array_elements_text(p_config->'phrases') x(phrase) where lower(x.phrase) in ('transaction type payment','transaction type receive from wallet'))
   and public.finance_receipt_direction_conflict_v2(p_text) then return jsonb_build_object('outcome','invalid_output','value',null); end if;
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


create function public.finance_approved_receipt_rule_catalog() returns table(rule_code text,source_kind text,field_name text,configuration jsonb,compatible_with_deployed boolean)
language sql immutable security invoker set search_path='' as $fn$
 values
 ('source_ryt','ryt','source_id','{"type":"source_phrase","phrase":"ryt bank","location":"filename"}'::jsonb,true),
 ('source_tng','tng','source_id','{"type":"source_phrase","phrase":"tng ewallet","location":"filename"}'::jsonb,true),
 ('date_tng','tng','transaction_date','{"type":"receipt_pattern","pattern":"tng_date"}'::jsonb,false),
 ('date_ryt','ryt','transaction_date','{"type":"receipt_pattern","pattern":"ryt_date"}'::jsonb,false),
 ('today_ryt','ryt','transaction_date','{"type":"filename_date","relative_day":"today"}'::jsonb,false),
 ('reference_ryt','ryt','reference_number','{"type":"reference_label","label":"reference id","placement":"inline","max_lines":1,"join":"concat"}'::jsonb,false),
 ('reference_tng_before','tng','reference_number','{"type":"receipt_pattern","pattern":"tng_wallet_before"}'::jsonb,false),
 ('direction_signed_ryt','ryt','direction','{"type":"receipt_pattern","pattern":"signed_direction"}'::jsonb,false),
 ('direction_signed_tng','tng','direction','{"type":"receipt_pattern","pattern":"signed_direction"}'::jsonb,false),
 ('direction_payment_tng','tng','direction','{"type":"direction_phrase","phrases":["transaction type payment"],"direction":"expense"}'::jsonb,true),
 ('direction_receive_tng','tng','direction','{"type":"direction_phrase","phrases":["transaction type receive from wallet"],"direction":"income"}'::jsonb,true),
 ('merchant_tng','tng','merchant','{"type":"same_line_label","label":"merchant"}'::jsonb,true),
 ('payee_receive_tng','tng','payee_name','{"type":"same_line_label","label":"receive from"}'::jsonb,true),
 ('reference_tng_wrapped','tng','reference_number','{"type":"receipt_pattern","pattern":"tng_wallet_wrapped"}'::jsonb,false);
$fn$;
create function public.finance_install_approved_receipt_rules(p_user_id uuid,p_ryt_source_id uuid,p_tng_source_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare boundary timestamptz; invocation uuid:=gen_random_uuid(); inserted_count int;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
 boundary:=finance_private.finance_parser_learning_cutoff(p_user_id);
 if not isfinite(boundary) then raise exception 'Configure an explicit learning cutoff first'; end if;
 if p_ryt_source_id=p_tng_source_id or (select count(*) from public.dim_finance_sources where id in (p_ryt_source_id,p_tng_source_id) and user_id=p_user_id and not is_archived)<>2 then
  raise exception 'Select two distinct active sources owned by this user'; end if;
 with definitions as (
  select *,case when source_kind='ryt' then p_ryt_source_id else p_tng_source_id end source_id from public.finance_approved_receipt_rule_catalog()
 ), keyed as (
  select *, 'v2:'||md5(source_id::text||':'||field_name||':'||configuration::text) key from definitions
 )
 insert into public.finance_parser_templates(user_id,template_key,target_source_id,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at)
 select p_user_id,d.key,case when d.field_name='source_id' then d.source_id end,case when d.field_name<>'source_id' then d.source_id end,
  d.field_name,d.configuration->>'type',d.configuration,2,
  coalesce((select max(t.template_version) from public.finance_parser_templates t where t.user_id=p_user_id and t.template_key=d.key and t.algorithm_version=2),0)+1,
  'proposed',boundary
 from keyed d where not exists(select 1 from public.finance_parser_templates t where t.user_id=p_user_id and t.template_key=d.key and t.algorithm_version=2 and t.learning_cutoff_at=boundary);
 get diagnostics inserted_count=row_count;
 perform public.finance_refresh_rule_suggestions(invocation);
 if not exists(select 1 from public.finance_learning_runs where invocation_id=invocation and status='succeeded') then raise exception 'Approved rule replay failed'; end if;
 return jsonb_build_object('inserted',inserted_count,'invocation_id',invocation);
end;
$fn$;
revoke all on function public.finance_approved_receipt_rule_catalog(),public.finance_install_approved_receipt_rules(uuid,uuid,uuid),
 public.finance_receipt_direction_conflict_v2(text),public.finance_approved_receipt_value_v2(text,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
