-- Additive algorithm 2 configuration types. Deploy both runtimes before installation.
-- Preserve every older evaluator definition and its OID-facing wrapper semantics.
do $copy$
begin
 execute replace(pg_get_functiondef('public.finance_parser_template_configuration_is_valid(jsonb)'::regprocedure),
  'FUNCTION public.finance_parser_template_configuration_is_valid(', 'FUNCTION public.finance_template_configuration_before_guarded(');
 execute replace(pg_get_functiondef('public.finance_evaluate_parser_template_v2(text,jsonb,text,text,jsonb)'::regprocedure),
  'FUNCTION public.finance_evaluate_parser_template_v2(', 'FUNCTION public.finance_evaluate_template_before_guarded(');
end;
$copy$;

create function public.finance_guarded_rule_text_is_valid(v jsonb) returns boolean
language sql immutable security invoker set search_path='' as $f$
 select coalesce(jsonb_typeof(v)='string' and public.finance_template_text_length_v2(v #>> '{}') between 1 and 120
  and length(btrim(v #>> '{}'))>0,false);
$f$;

create or replace function public.finance_parser_template_configuration_is_valid(p_configuration jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $f$
declare c jsonb; x jsonb:=p_configuration->'extraction'; typ text:=p_configuration->>'type'; n int; distinct_n int;
begin
 if coalesce(typ,'') not in ('source_signature','guarded_merchant') then
  return public.finance_template_configuration_before_guarded(p_configuration);
 end if;
 if jsonb_typeof(p_configuration) is distinct from 'object' or octet_length(p_configuration::text)>4096 then return false; end if;
 if not public.finance_jsonb_has_exact_keys(p_configuration,case when typ='source_signature'
  then array['type','conditions','replaces_source_id'] else array['type','conditions','extraction','clear_matching_payee'] end) then return false; end if;
 if jsonb_typeof(p_configuration->'conditions') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_configuration->'conditions') not between 1 and 5 then return false; end if;
 for c in select value from jsonb_array_elements(p_configuration->'conditions') loop
  if not public.finance_jsonb_has_exact_keys(c,array['mode','text'])
   or (c->>'mode') not in ('exact','prefix','label') or jsonb_typeof(c->'mode') is distinct from 'string'
   or not public.finance_guarded_rule_text_is_valid(c->'text') then return false; end if;
 end loop;
 if typ='source_signature' then
  return coalesce(jsonb_typeof(p_configuration->'replaces_source_id')='string'
   and (p_configuration->>'replaces_source_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false);
 end if;
 if jsonb_typeof(p_configuration->'clear_matching_payee') is distinct from 'boolean'
  or jsonb_typeof(x) is distinct from 'object' or not public.finance_guarded_rule_text_is_valid(x->'label') then return false; end if;
 if x->>'type'='same_line_label' then return public.finance_jsonb_has_exact_keys(x,array['type','label']); end if;
 if x->>'type' is distinct from 'before_label' or not public.finance_jsonb_has_exact_keys(x,array['type','label','strip_prefixes'])
  or jsonb_typeof(x->'strip_prefixes') is distinct from 'array' then return false; end if;
 if jsonb_array_length(x->'strip_prefixes') not between 1 and 10 then return false; end if;
 for c in select value from jsonb_array_elements(x->'strip_prefixes') loop
  if not public.finance_guarded_rule_text_is_valid(c) then return false; end if;
 end loop;
 select count(*),count(distinct lower(btrim(normalize(value,NFKC)))) into n,distinct_n
 from jsonb_array_elements_text(x->'strip_prefixes');
 return n=distinct_n;
end;
$f$;

alter table public.finance_parser_templates
 add column replacement_source_id uuid generated always as
  (case when template_type='source_signature' then (configuration->>'replaces_source_id')::uuid end) stored,
 add constraint finance_guarded_replacement_source_fkey foreign key(replacement_source_id,user_id)
  references public.dim_finance_sources(id,user_id) on delete no action deferrable initially deferred,
 add constraint finance_guarded_rule_version_check check(template_type not in ('source_signature','guarded_merchant') or algorithm_version=2),
 add constraint finance_guarded_source_pair_check check(replacement_source_id is null or replacement_source_id<>target_source_id);
create index finance_guarded_replacement_source_idx on public.finance_parser_templates(replacement_source_id,user_id)
 where replacement_source_id is not null;

-- Extend existing checks instead of replacing restrictions on older types.
do $checks$
declare constraint_name text; expression text; extra text;
begin
 foreach constraint_name in array array['finance_parser_templates_type_check','finance_parser_templates_field_type_check'] loop
  select pg_get_expr(conbin,conrelid) into expression from pg_constraint
   where conrelid='public.finance_parser_templates'::regclass and conname=constraint_name;
  if expression is null then raise exception 'Missing predecessor constraint %',constraint_name; end if;
  extra:=case when constraint_name='finance_parser_templates_type_check' then $$template_type in ('source_signature','guarded_merchant')$$
   else $$(template_type='source_signature' and field_name='source_id') or (template_type='guarded_merchant' and field_name='merchant')$$ end;
  execute format('alter table public.finance_parser_templates drop constraint %I, add constraint %I check ((%s) or (%s))',constraint_name,constraint_name,expression,extra);
 end loop;
end;
$checks$;

create function public.finance_guarded_label_tail(p_line text,p_label text) returns text
language plpgsql immutable security invoker set search_path='' as $f$
declare line text:=public.finance_template_text_v2(p_line); anchor text:=public.finance_template_text_v2(p_label); tail text;
begin
 if lower(left(line,length(anchor)))<>lower(anchor) then return null; end if;
 tail:=substr(line,length(anchor)+1);
 if tail<>'' and tail !~ '^[[:space:]:-]' then return null; end if;
 return regexp_replace(tail,'^[[:space:]:-]+','');
end;
$f$;

create function public.finance_guarded_conditions_match(p_text text,p_conditions jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $f$
declare c jsonb; line text; tail text; found boolean; lines text[]:=public.finance_template_lines_v2(p_text);
begin
 for c in select value from jsonb_array_elements(p_conditions) loop
  found:=false;
  foreach line in array lines loop
   if c->>'mode'='exact' then
    found:=lower(public.finance_template_text_v2(line))=lower(public.finance_template_text_v2(c->>'text'));
   else
    tail:=public.finance_guarded_label_tail(line,c->>'text');
    found:=tail is not null and (c->>'mode'='prefix' or tail<>'');
   end if;
   exit when found;
  end loop;
  if not found then return false; end if;
 end loop;
 return true;
end;
$f$;

create or replace function public.finance_evaluate_parser_template_v2(
 p_field text,p_config jsonb,p_text text,p_filename text,p_payees jsonb default '[]'
) returns jsonb language plpgsql immutable security invoker set search_path='' as $f$
declare lines text[]:=public.finance_template_lines_v2(p_text); x jsonb:=p_config->'extraction';
 i int; raw text; output text; first_value text; prefix text; prefixes text[]; matched boolean:=false;
begin
 if coalesce(p_config->>'type','') not in ('source_signature','guarded_merchant') then
  return public.finance_evaluate_template_before_guarded(p_field,p_config,p_text,p_filename,p_payees);
 end if;
 if not public.finance_parser_template_configuration_is_valid(p_config)
  or (p_config->>'type'='source_signature' and p_field<>'source_id')
  or (p_config->>'type'='guarded_merchant' and p_field<>'merchant') then return jsonb_build_object('outcome','invalid_output'); end if;
 if not public.finance_guarded_conditions_match(p_text,p_config->'conditions') then return jsonb_build_object('outcome','not_applicable'); end if;
 if p_config->>'type'='source_signature' then return jsonb_build_object('outcome','value','value','match'); end if;
 for i in 1..coalesce(cardinality(lines),0) loop
  raw:=null;
  if x->>'type'='same_line_label' then raw:=public.finance_guarded_label_tail(lines[i],x->>'label');
  elsif lower(public.finance_template_text_v2(lines[i]))=lower(public.finance_template_text_v2(x->>'label')) then
   select array_agg(normalize(value,NFKC)) into prefixes from jsonb_array_elements_text(x->'strip_prefixes')
    where starts_with(coalesce(lines[i-1],''),normalize(value,NFKC));
   if cardinality(prefixes)>1 then return jsonb_build_object('outcome','invalid_output'); end if;
   if cardinality(prefixes)=1 then raw:=substr(lines[i-1],length(prefixes[1])+1); end if;
  end if;
  if raw is null then continue; end if;
  matched:=true;
  output:=public.finance_template_value_v2('merchant',raw);
  if output is null or output !~ '[[:alpha:]]' then return jsonb_build_object('outcome','invalid_output'); end if;
  if first_value is not null and lower(first_value)<>lower(output) then return jsonb_build_object('outcome','invalid_output'); end if;
  first_value:=output;
 end loop;
 return case when first_value is not null then jsonb_build_object('outcome','value','value',first_value)
  else jsonb_build_object('outcome',case when matched then 'invalid_output' else 'not_applicable' end) end;
end;
$f$;

-- Configuration data only. The generic evaluators contain no bank names or receipt labels.
create function public.finance_guarded_receipt_rule_catalog(p_wallet_source_id uuid)
returns table(rule_code text,source_kind text,field_name text,configuration jsonb)
language sql immutable security invoker set search_path='' as $f$
 values
 ('card_source','card','source_id',jsonb_build_object('type','source_signature','replaces_source_id',p_wallet_source_id,
  'conditions','[{"mode":"label","text":"Posting Time"},{"mode":"label","text":"Card Balance"},{"mode":"label","text":"Entry Loc"}]'::jsonb)),
 ('qr_merchant','bank','merchant','{"type":"guarded_merchant","conditions":[{"mode":"exact","text":"Transaction type DuitNow QR"}],"extraction":{"type":"same_line_label","label":"To"},"clear_matching_payee":true}'::jsonb),
 ('merchant_icon','bank','merchant','{"type":"guarded_merchant","conditions":[{"mode":"exact","text":"Successful"},{"mode":"label","text":"RM"},{"mode":"prefix","text":"Reference ID"}],"extraction":{"type":"before_label","label":"Paid from Main Account","strip_prefixes":["D ","DO "]},"clear_matching_payee":false}'::jsonb);
$f$;

create function public.finance_install_guarded_receipt_rules(p_user_id uuid,p_bank_source_id uuid,p_wallet_source_id uuid,p_card_source_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare boundary timestamptz; invocation uuid:=gen_random_uuid(); inserted_count int;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_refresh_rule_suggestions',1));
 boundary:=finance_private.finance_parser_learning_cutoff(p_user_id);
 if not isfinite(boundary) then raise exception 'Configure an explicit learning cutoff first'; end if;
 if (select count(*) from public.dim_finance_sources where user_id=p_user_id and not is_archived
  and id in(p_bank_source_id,p_wallet_source_id,p_card_source_id))<>3 then raise exception 'Select three distinct active owned sources'; end if;
 with definitions as (
  select *,case when source_kind='bank' then p_bank_source_id else p_card_source_id end source_id
  from public.finance_guarded_receipt_rule_catalog(p_wallet_source_id)
 ), keyed as (
  select *, 'v2:'||md5(source_id::text||':'||field_name||':'||configuration::text) key from definitions
 )
 insert into public.finance_parser_templates(user_id,template_key,target_source_id,scope_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at)
 select p_user_id,d.key,case when d.field_name='source_id' then d.source_id end,case when d.field_name<>'source_id' then d.source_id end,
  d.field_name,d.configuration->>'type',d.configuration,2,
  coalesce((select max(t.template_version) from public.finance_parser_templates t where t.user_id=p_user_id and t.template_key=d.key and t.algorithm_version=2),0)+1,
  'proposed',boundary
 from keyed d where not exists(select 1 from public.finance_parser_templates t
  where t.user_id=p_user_id and t.template_key=d.key and t.algorithm_version=2 and t.learning_cutoff_at=boundary);
 get diagnostics inserted_count=row_count;
 perform public.finance_refresh_rule_suggestions(invocation);
 if not exists(select 1 from public.finance_learning_runs where invocation_id=invocation and status='succeeded') then raise exception 'Guarded rule replay failed'; end if;
 return jsonb_build_object('inserted',inserted_count,'invocation_id',invocation);
end;
$f$;

revoke all on function public.finance_template_configuration_before_guarded(jsonb),
 public.finance_evaluate_template_before_guarded(text,jsonb,text,text,jsonb),
 public.finance_guarded_rule_text_is_valid(jsonb),public.finance_guarded_label_tail(text,text),
 public.finance_guarded_conditions_match(text,jsonb),public.finance_guarded_receipt_rule_catalog(uuid),
 public.finance_install_guarded_receipt_rules(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
