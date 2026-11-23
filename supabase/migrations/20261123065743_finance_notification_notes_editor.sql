begin;
set local lock_timeout='10s';
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
   if k is null or k not in ('amount','date','time','text','reference','foreign_money','notes') or k=any(kinds) or last_variable
    or exists(select 1 from jsonb_object_keys(p) x where x not in ('kind','field')) then return false; end if;
   if k='foreign_money' and (p->>'field' is distinct from 'foreign_amount' or d ? 'match') then return false; end if;
   if k='notes' and (p->>'field' is distinct from 'notes' or p is distinct from d->'parts'->(jsonb_array_length(d->'parts')-1) or d ? 'match' or coalesce((d->>'trailing_sentence')::boolean,false)) then return false; end if;
   kinds:=array_append(kinds,k); last_variable:=true;
   if p ? 'field' then
    if p->>'field' is null or p->>'field'=any(fields) or not (
     (k='notes' and p->>'field'='notes') or (k='foreign_money' and p->>'field'='foreign_amount') or (k='amount' and p->>'field'='amount') or (k='date' and p->>'field'='transaction_date')
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

-- Recognize the legacy family structurally, without keeping one format per note.
create function finance_private.notification_legacy_note_format(d jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(d->'parts'->0='{"kind":"amount","field":"amount"}'::jsonb
  and d->'parts'->>1=' received from ' and d->'parts'->2='{"kind":"text","field":"payee_name"}'::jsonb
  and jsonb_array_length(d->'parts')=4 and jsonb_typeof(d->'parts'->3)='string'
  and left(d->'parts'->>3,5)=' for ' and d->>'direction'='income',false);
$$;
revoke all on function finance_private.notification_legacy_note_format(jsonb) from public,anon,authenticated;
grant execute on function finance_private.notification_legacy_note_format(jsonb) to service_role;

-- Existing clients keep v1 and its original definitions until they upgrade.
create function public.finance_notification_patterns_for_user_v2(p_user_id uuid,p_source_id uuid)
returns setof public.finance_notification_patterns language sql stable security invoker set search_path='' as $$
 select p.* from public.finance_notification_patterns p
 where exists(select 1 from public.dim_finance_sources s where s.id=p_source_id and s.user_id=p_user_id and not s.is_archived)
 and (p.user_id is null or (p.user_id=p_user_id and p.source_id=p_source_id))
 and not (p.source_package='my.com.tngdigital.ewallet' and p.origin in ('starter','learned')
  and finance_private.notification_legacy_note_format(p.definition))
 order by p.user_id nulls first,p.source_package,p.format_key;
$$;
revoke all on function public.finance_notification_patterns_for_user_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finance_notification_patterns_for_user_v2(uuid,uuid) to service_role;

create function public.finance_save_notification_pattern_v1(p_user_id uuid,p_source_id uuid,p_id uuid,p_revision integer,
 p_name text,p_definition jsonb,p_is_active boolean)
returns public.finance_notification_patterns language plpgsql security invoker set search_path='' as $$
declare p public.finance_notification_patterns; n text:=btrim(p_name);
begin
 if p_id is null or p_revision is null or p_revision<1 or n is null or length(n) not between 1 and 100
  or p_is_active is null or p_definition ? 'action' or finance_private.notification_definition_valid(p_definition) is distinct from true then
  raise exception using errcode='22023',message='Invalid notification pattern'; end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 perform 1 from public.dim_finance_sources where id=p_source_id and user_id=p_user_id and not is_archived for share;
 if not found then raise exception using errcode='P0002',message='Finance source not found'; end if;
 select * into p from public.finance_notification_patterns where id=p_id
  and (user_id is null or (user_id=p_user_id and source_id=p_source_id)) for update;
 if not found or p.definition ? 'action' then raise exception using errcode='P0002',message='Notification pattern not found'; end if;
 if p.revision<>p_revision or (p.user_id is null and exists(select 1 from public.finance_notification_patterns
  where user_id=p_user_id and source_id=p_source_id and source_package=p.source_package and format_key=p.format_key)) then
  raise exception using errcode='40001',message='Notification pattern changed'; end if;
 if p.user_id is null then
  if (select count(*) from public.finance_notification_patterns where user_id=p_user_id and source_id=p_source_id)>=200 then
   raise exception using errcode='22023',message='Pattern limit reached'; end if;
  insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,is_active)
   values(p_user_id,p_source_id,p.source_package,p.format_key,n,p_definition,'override',p_is_active) returning * into p;
 else
  update public.finance_notification_patterns set name=n,definition=p_definition,origin='override',is_active=p_is_active,
   evidence_valid=true,evidence_transaction_id=null,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 end if;
 return p;
end $$;
revoke all on function public.finance_save_notification_pattern_v1(uuid,uuid,uuid,integer,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finance_save_notification_pattern_v1(uuid,uuid,uuid,integer,text,jsonb,boolean) to service_role;

create or replace function finance_private.invalidate_notification_learning() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (old.amount,old.direction,old.merchant,old.payee_id,old.transaction_date,old.reference_number,old.source_id)
  is distinct from (new.amount,new.direction,new.merchant,new.payee_id,new.transaction_date,new.reference_number,new.source_id) then
  update public.finance_notification_patterns set evidence_valid=false,revision=revision+1,updated_at=clock_timestamp()
   where evidence_transaction_id=old.id and user_id=old.user_id and evidence_valid;
 else
  update public.finance_notification_patterns set evidence_valid=false,revision=revision+1,updated_at=clock_timestamp()
   where evidence_transaction_id=old.id and user_id=old.user_id and evidence_valid and (
    ((old.foreign_amount,old.foreign_currency) is distinct from (new.foreign_amount,new.foreign_currency)
      and definition->'parts' @> '[{"kind":"foreign_money"}]'::jsonb)
    or (old.notes is distinct from new.notes and definition->'parts' @> '[{"kind":"notes","field":"notes"}]'::jsonb));
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

insert into public.finance_notification_patterns(id,source_package,format_key,name,definition) values
('52000000-0000-4000-8000-000000000020','my.com.tngdigital.ewallet','tng-received-notes','TNG incoming transfer with notes','{"version":1,"parts":[{"kind":"amount","field":"amount"}," received from ",{"kind":"text","field":"payee_name"}," for ",{"kind":"notes","field":"notes"}],"direction":"income"}'::jsonb);
-- Preserve conservative disabled/invalid preferences when consolidating owner formats.
insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,is_active)
 select user_id,source_id,source_package,'tng-received-notes','TNG incoming transfer with notes','{"version":1,"parts":[{"kind":"amount","field":"amount"}," received from ",{"kind":"text","field":"payee_name"}," for ",{"kind":"notes","field":"notes"}],"direction":"income"}'::jsonb,
  'override',bool_and(is_active and evidence_valid)
 from public.finance_notification_patterns where user_id is not null and origin in ('learned','override')
  and source_package='my.com.tngdigital.ewallet' and finance_private.notification_legacy_note_format(definition)
 group by user_id,source_id,source_package;

-- A concurrent manual edit must win over learning prepared before that edit.
do $patch$
declare definition text; before_text text:='revision=finance_notification_patterns.revision+1,updated_at=clock_timestamp();';
begin
 definition:=pg_get_functiondef('public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb)'::regprocedure);
 if position(before_text in definition)=0 then raise exception 'Notification learning conflict hook not found'; end if;
 definition:=replace(definition,before_text,E'revision=finance_notification_patterns.revision+1,updated_at=clock_timestamp()\n   where finance_notification_patterns.origin<>''override'';');
 execute definition;
end $patch$;

notify pgrst,'reload schema';
commit;
