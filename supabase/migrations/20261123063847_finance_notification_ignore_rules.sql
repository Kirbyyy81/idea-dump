begin;
set local lock_timeout='10s';
create function finance_private.notification_ignore_prefix(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(translate(normalize(p,NFKC),'‘’ʼ',repeat(chr(39),3)),'[[:space:]]+',' ','g'));
$$;
revoke all on function finance_private.notification_ignore_prefix(text) from public,anon,authenticated;
grant execute on function finance_private.notification_ignore_prefix(text) to service_role;
create or replace function finance_private.notification_definition_valid(d jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; k text; fields text[]:='{}'; kinds text[]:='{}'; last_variable boolean:=false; literal_size int:=0;
begin
 if d ? 'action' then
  if jsonb_typeof(d) is distinct from 'object' or d->>'action' is distinct from 'ignore'
   or d->'version' is distinct from '1'::jsonb or d->'trailing_sentence' is distinct from 'true'::jsonb
   or (select count(*) from jsonb_object_keys(d))<>4
   or jsonb_typeof(d->'parts') is distinct from 'array' then return false; end if;
  if jsonb_array_length(d->'parts')<>1 or jsonb_typeof(d->'parts'->0) is distinct from 'string' then return false; end if;
  return length(d->'parts'->>0) between 4 and 120
   and (d->'parts'->>0) !~ '[[:cntrl:]]'
   and (d->'parts'->>0)=finance_private.notification_ignore_prefix(d->'parts'->>0);
 end if;
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

create function public.finance_save_notification_ignore_rule_v1(p_user_id uuid,p_source_id uuid,p_id uuid,p_revision integer,
 p_name text,p_prefix text,p_source_package text,p_is_active boolean)
returns public.finance_notification_patterns language plpgsql security invoker set search_path='' as $$
declare p public.finance_notification_patterns; d jsonb; n text:=btrim(p_name);
begin
 d:=jsonb_build_object('version',1,'action','ignore','parts',jsonb_build_array(finance_private.notification_ignore_prefix(p_prefix)),'trailing_sentence',true);
 if n is null or length(n) not between 1 and 100 or p_source_package is null
  or p_source_package not in ('*','my.rytbank.app','my.com.tngdigital.ewallet') or p_is_active is null
  or (p_id is null)<>(p_revision is null) or (p_revision is not null and p_revision<1)
  or finance_private.notification_definition_valid(d) is distinct from true then
  raise exception using errcode='22023',message='Invalid ignore rule';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 perform 1 from public.dim_finance_sources where id=p_source_id and user_id=p_user_id and not is_archived for share;
 if not found then raise exception using errcode='P0002',message='Finance source not found'; end if;
 if p_id is not null then
  select * into p from public.finance_notification_patterns where id=p_id
   and (user_id is null or (user_id=p_user_id and source_id=p_source_id)) for update;
  if not found or p.definition->>'action' is distinct from 'ignore' then
   raise exception using errcode='P0002',message='Ignore rule not found'; end if;
  if p.revision<>p_revision or (p.user_id is null and exists(select 1 from public.finance_notification_patterns
   where user_id=p_user_id and source_id=p_source_id and source_package=p.source_package and format_key=p.format_key)) then
   raise exception using errcode='40001',message='Ignore rule changed'; end if;
  if p.source_package<>p_source_package then raise exception using errcode='22023',message='Application cannot change'; end if;
 end if;
 if p.user_id is null then
  if (select count(*) from public.finance_notification_patterns where user_id=p_user_id and source_id=p_source_id
   and definition->>'action'='ignore')>=100 then raise exception using errcode='22023',message='Ignore rule limit reached'; end if;
  insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,is_active)
  values(p_user_id,p_source_id,p_source_package,coalesce(p.format_key,'custom-ignore-'||gen_random_uuid()::text),n,d,'override',p_is_active)
  returning * into p;
 else
  update public.finance_notification_patterns set name=n,definition=d,is_active=p_is_active,evidence_valid=true,
   evidence_transaction_id=null,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 end if;
 return p;
end $$;
revoke all on function public.finance_save_notification_ignore_rule_v1(uuid,uuid,uuid,integer,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_save_notification_ignore_rule_v1(uuid,uuid,uuid,integer,text,text,text,boolean) to service_role;

insert into public.finance_notification_patterns(id,source_package,format_key,name,definition) values
('52000000-0000-4000-8000-000000000018','my.rytbank.app','ryt-card-approval-title','Card payment approval prompt','{"version":1,"action":"ignore","parts":["Tap to confirm card payment"],"trailing_sentence":true}'::jsonb),
('52000000-0000-4000-8000-000000000019','my.rytbank.app','ryt-card-approval-request','Card payment approval request','{"version":1,"action":"ignore","parts":["Confirm card payment of"],"trailing_sentence":true}'::jsonb);
notify pgrst,'reload schema';
commit;
