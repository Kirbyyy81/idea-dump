begin;
set local lock_timeout='5s';

create function finance_private.foreign_details_valid(p_amount numeric,p_currency text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select (p_amount is null and p_currency is null) or coalesce(
  p_amount>0 and p_amount<1000000000000 and scale(p_amount)<=4
  and p_currency=any(string_to_array('AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG ZWL',' ')),false);
$$;

alter table public.finance_transactions
 add column foreign_amount numeric,
 add column foreign_currency text,
 add constraint finance_foreign_details_check
  check (finance_private.foreign_details_valid(foreign_amount,foreign_currency));

-- Reject rather than round excess precision. Older callers omit both keys.
create function finance_private.read_foreign_amount(p_input jsonb,p_amount_key text,p_currency_key text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare value text:=p_input->>p_amount_key; code text:=p_input->>p_currency_key; amount numeric;
begin
 if (p_input ? p_amount_key) is distinct from (p_input ? p_currency_key)
  or (value is not null and (jsonb_typeof(p_input->p_amount_key) not in ('string','number') or value !~ '^[0-9]{1,12}([.][0-9]{1,4})?$'))
  or (code is not null and jsonb_typeof(p_input->p_currency_key)<>'string') then
  raise exception 'Invalid foreign details' using errcode='22023';
 end if;
 amount:=value::numeric;
 if not finance_private.foreign_details_valid(amount,code) then
  raise exception 'Invalid foreign details' using errcode='22023';
 end if;
 return amount;
end $$;

create or replace function public.finance_save_tagged_transaction(p_user_id uuid,p_input jsonb,p_transaction_id uuid default null)
returns public.finance_transactions language plpgsql security invoker set search_path='' as $$
declare saved public.finance_transactions; existing_id uuid; requested uuid[]; previous uuid[];
 foreign_value numeric; foreign_code text; foreign_provided boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 foreign_provided:=p_input ? 'p_foreign_amount' or p_input ? 'p_foreign_currency';
 if foreign_provided then
  foreign_value:=finance_private.read_foreign_amount(p_input,'p_foreign_amount','p_foreign_currency');
  foreign_code:=p_input->>'p_foreign_currency';
 end if;
 if p_input ? 'p_tag_ids' then
  if jsonb_typeof(p_input->'p_tag_ids')<>'array' then raise exception 'Tags must be an array' using errcode='22023'; end if;
  select coalesce(array_agg(distinct id::uuid order by id::uuid),'{}') into requested from jsonb_array_elements_text(p_input->'p_tag_ids') id;
 end if;
 if p_transaction_id is null then
  select id into existing_id from public.finance_transactions where user_id=p_user_id and manual_idempotency_key=(p_input->>'p_manual_idempotency_key')::uuid;
  if existing_id is not null then
   select * into saved from public.finance_transactions where id=existing_id and user_id=p_user_id;
   if row(saved.source_id,saved.category_id,saved.direction,saved.amount,saved.merchant,saved.transaction_date,saved.notes,saved.currency,saved.reference_number,
    (select name from public.dim_finance_payees where id=saved.payee_id and user_id=p_user_id)) is distinct from
    row((p_input->>'p_source_id')::uuid,(p_input->>'p_category_id')::uuid,p_input->>'p_direction',(p_input->>'p_amount')::numeric,
    nullif(btrim(p_input->>'p_merchant'),''),(p_input->>'p_transaction_date')::date,nullif(btrim(p_input->>'p_notes'),''),p_input->>'p_currency',
    public.finance_normalize_reference_number(p_input->>'p_reference_number'),nullif(btrim(p_input->>'p_payee_name'),'')) then
    raise exception 'Transaction request ID was already used for different details' using errcode='23505';
   end if;
   if (saved.foreign_amount,saved.foreign_currency) is distinct from (foreign_value,foreign_code) then
    raise exception 'Transaction request ID was already used for different foreign details' using errcode='23505';
   end if;
   if requested is not null then
    select coalesce(array_agg(tag_id order by tag_id),'{}') into previous from public.finance_transaction_tags where transaction_id=existing_id and user_id=p_user_id;
    if previous is distinct from requested then raise exception 'Transaction request ID was already used for different tags' using errcode='23505'; end if;
   end if;
   return saved;
  end if;
  select * into saved from public.finance_create_manual_transaction_v2(p_user_id,(p_input->>'p_source_id')::uuid,(p_input->>'p_category_id')::uuid,
   p_input->>'p_direction',(p_input->>'p_amount')::numeric,p_input->>'p_merchant',p_input->>'p_payee_name',(p_input->>'p_transaction_date')::date,
   p_input->>'p_notes',p_input->>'p_currency',p_input->>'p_reference_number',(p_input->>'p_manual_idempotency_key')::uuid);
 else
  select * into saved from public.finance_update_transaction_v3(p_user_id,p_transaction_id,(p_input->>'p_source_id')::uuid,(p_input->>'p_category_id')::uuid,
   p_input->>'p_direction',(p_input->>'p_amount')::numeric,p_input->>'p_merchant',p_input->>'p_payee_name',(p_input->>'p_transaction_date')::date,
   p_input->>'p_notes',p_input->>'p_currency',p_input->>'p_reference_number');
 end if;
 if foreign_provided and (saved.foreign_amount,saved.foreign_currency) is distinct from (foreign_value,foreign_code) then
  update public.finance_transactions set foreign_amount=foreign_value,foreign_currency=foreign_code
   where id=saved.id and user_id=p_user_id returning * into strict saved;
 end if;
 perform finance_private.replace_transaction_tags(p_user_id,saved.id,requested);
 return saved;
end $$;

-- The existing confirmation entry points own the ledger lock. Attach a tag
-- only to a newly confirmed import and only after its foreign pair is validated.
create function finance_private.attach_confirmed_foreign_details(p_user_id uuid,p_result jsonb,p_amount numeric,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.finance_transactions; trip uuid;
begin
 if p_amount is null or p_result->>'confirmed' is distinct from 'true' then return p_result; end if;
 update public.finance_transactions set foreign_amount=p_amount,foreign_currency=p_currency
 where id=(p_result->'transaction'->>'id')::uuid and user_id=p_user_id and status='confirmed'
 returning * into strict saved;
 select id into trip from public.dim_finance_tags
 where user_id=p_user_id and not is_archived and lower(name) ~ '^travel -[[:space:]]*[^[:space:]]'
 order by created_at desc,id desc limit 1 for share;
 if trip is not null then
  insert into public.finance_transaction_tags(transaction_id,tag_id,user_id)
   values(saved.id,trip,p_user_id) on conflict do nothing;
 end if;
 return jsonb_set(p_result,'{transaction}',to_jsonb(saved)||jsonb_build_object('foreign_amount',saved.foreign_amount::text),false);
end $$;

-- Keep the positional v3 RPC available to older callers and screenshot automation.
create function public.finance_confirm_review_with_foreign(p_user_id uuid,p_candidate_id uuid,p_confirmation jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare before_status text; result jsonb; foreign_value numeric;
begin
 if p_confirmation->>'p_confirmation_mode' is distinct from 'manual' then
  raise exception 'Manual confirmation required' using errcode='22023';
 end if;
 foreign_value:=finance_private.read_foreign_amount(p_confirmation,'p_foreign_amount','p_foreign_currency');
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select status into strict before_status from public.finance_candidate_transactions
  where id=p_candidate_id and user_id=p_user_id for update;
 result:=public.finance_confirm_candidate_v3(p_user_id,p_candidate_id,(p_confirmation->>'p_source_id')::uuid,
  (p_confirmation->>'p_category_id')::uuid,p_confirmation->>'p_direction',(p_confirmation->>'p_amount')::numeric,
  p_confirmation->>'p_merchant',p_confirmation->>'p_payee_name',(p_confirmation->>'p_transaction_date')::date,
  p_confirmation->>'p_notes',p_confirmation->>'p_currency',p_confirmation->>'p_reference_number',
  coalesce((p_confirmation->>'p_allow_duplicate')::boolean,false),p_confirmation->>'p_duplicate_override_reason','manual');
 if before_status='accepted' then return result; end if;
 return finance_private.attach_confirmed_foreign_details(p_user_id,result,foreign_value,p_confirmation->>'p_foreign_currency');
end $$;

create or replace function finance_private.notification_definition_valid(d jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; k text; fields text[]:='{}'; kinds text[]:='{}'; last_variable boolean:=false; literal_size int:=0;
begin
 if jsonb_typeof(d) is distinct from 'object' or d->>'version' is distinct from '1'
 or jsonb_typeof(d->'parts') is distinct from 'array' or octet_length(d::text)>8192 then return false; end if;
 if jsonb_array_length(d->'parts') not between 1 and 24
 or exists(select 1 from jsonb_object_keys(d) x where x not in ('version','parts','direction','trailing_sentence','match'))
 or (d ? 'direction' and d->>'direction' not in ('expense','income'))
 or (d ? 'match' and d->>'match'<>'contains')
 or (d ? 'trailing_sentence' and jsonb_typeof(d->'trailing_sentence')<>'boolean') then return false; end if;
 for p in select value from jsonb_array_elements(d->'parts') loop
  if jsonb_typeof(p)='string' then
   if length(p#>>'{}') not between 1 and 120 then return false; end if;
   literal_size:=literal_size+length(p#>>'{}'); last_variable:=false;
  elsif jsonb_typeof(p)='object' then
   k:=p->>'kind';
   if k is null or k not in ('amount','date','time','text','reference','foreign_money') or k=any(kinds) or last_variable
    or exists(select 1 from jsonb_object_keys(p) x where x not in ('kind','field')) then return false; end if;
   if k='foreign_money' and (p->>'field' is distinct from 'foreign_amount' or d ? 'match') then return false; end if;
   kinds:=array_append(kinds,k); last_variable:=true;
   if p ? 'field' then
    if p->>'field' is null or p->>'field'=any(fields) or not (
     (k='foreign_money' and p->>'field'='foreign_amount') or (k='amount' and p->>'field'='amount') or (k='date' and p->>'field'='transaction_date')
     or (k='text' and p->>'field' in ('merchant','payee_name')) or (k='reference' and p->>'field'='reference_number')
    ) then return false; end if;
    fields:=array_append(fields,p->>'field');
   end if;
  else return false; end if;
 end loop;
 if 'foreign_money'=any(kinds) and (not ('amount'=any(fields)) or not ('merchant'=any(fields) or 'payee_name'=any(fields))) then return false; end if;
 return (literal_size between 4 and 500 or (d->>'match'='contains' and jsonb_array_length(d->'parts')=1 and d->'parts'->0->>'kind'='date'))
  and not ('merchant'=any(fields) and 'payee_name'=any(fields));
end $$;
create or replace function finance_private.invalidate_notification_learning() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (old.amount,old.direction,old.merchant,old.payee_id,old.transaction_date,old.reference_number,old.source_id)
  is distinct from (new.amount,new.direction,new.merchant,new.payee_id,new.transaction_date,new.reference_number,new.source_id) then
  update public.finance_notification_patterns set evidence_valid=false,revision=revision+1,updated_at=clock_timestamp()
  where evidence_transaction_id=old.id and user_id=old.user_id and evidence_valid;
 elsif (old.foreign_amount,old.foreign_currency) is distinct from (new.foreign_amount,new.foreign_currency) then
  update public.finance_notification_patterns set evidence_valid=false,revision=revision+1,updated_at=clock_timestamp()
  where evidence_transaction_id=old.id and user_id=old.user_id and evidence_valid
   and definition->'parts' @> '[{"kind":"foreign_money"}]'::jsonb;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
-- Keep the same notification RPC signature for deployed clients. This wrapper
-- still owns digest checks, raw-text cleanup and learning in one transaction.
do $patch$
declare definition text; before_text text; after_text text; start_at int; end_at int;
begin
 definition:=replace(pg_get_functiondef('public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb)'::regprocedure),E'\r','');
 start_at:=position(' result:=public.finance_confirm_candidate_v3(' in definition);
 end_at:=position(' if c.status=''accepted'' or coalesce(' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Notification confirmation hook not found'; end if;
 execute left(definition,start_at-1)||$hook$ result:=public.finance_confirm_review_with_foreign(p_user_id,p_candidate_id,p_confirmation);
$hook$||substr(definition,end_at);

 -- Validate the pair and current extraction evidence before the auto-confirm
 -- subtransaction. A failed pair can never leave a confirmed MYR-only row.
 definition:=replace(pg_get_functiondef('finance_private.auto_confirm_notification(uuid,uuid)'::regprocedure),E'\r','');
 before_text:='p jsonb; result jsonb;';
 after_text:='p jsonb; result jsonb; foreign_value numeric;';
 if position(before_text in definition)=0 then raise exception 'Notification declaration hook not found'; end if;
 definition:=replace(definition,before_text,after_text);
 before_text:='  -- No learning wrapper: an automatic result is not a human-confirmed example.';
 after_text:=$hook$  foreign_value:=finance_private.read_foreign_amount(p,'foreign_amount','foreign_currency');
  if foreign_value is not null and (
   p->'notification_extraction'->'fields'->'foreign_amount' is null
   or p->'notification_extraction'->'fields'->'foreign_currency' is null
  ) then return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
$hook$||before_text;
 if position(before_text in definition)=0 then raise exception 'Automatic notification validation hook not found'; end if;
 definition:=replace(definition,before_text,after_text);
 before_text:='false,null,''automatic'');';
 after_text:=before_text||$hook$
  result:=finance_private.attach_confirmed_foreign_details(p_user_id,result,foreign_value,p->>'foreign_currency');
$hook$;
 if position(before_text in definition)=0 then raise exception 'Automatic notification write hook not found'; end if;
 execute replace(definition,before_text,after_text);
end $patch$;

revoke all on function finance_private.foreign_details_valid(numeric,text),
 finance_private.read_foreign_amount(jsonb,text,text),
 finance_private.attach_confirmed_foreign_details(uuid,jsonb,numeric,text),
 public.finance_confirm_review_with_foreign(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function finance_private.foreign_details_valid(numeric,text),
 finance_private.read_foreign_amount(jsonb,text,text),
 finance_private.attach_confirmed_foreign_details(uuid,jsonb,numeric,text),
 public.finance_confirm_review_with_foreign(uuid,uuid,jsonb) to service_role;

insert into public.finance_notification_patterns(id,source_package,format_key,name,definition)
values ('52000000-0000-4000-8000-000000000017','my.rytbank.app','ryt-foreign-card-payment','Ryt foreign card payment','{"version":1,"parts":[{"kind":"amount","field":"amount"}," (",{"kind":"foreign_money","field":"foreign_amount"},") paid at ",{"kind":"text","field":"merchant"}," using your Main Account"],"direction":"expense"}'::jsonb);

notify pgrst, 'reload schema';
commit;
