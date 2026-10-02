alter table public.finance_notification_patterns
 add column evidence_transaction_id uuid references public.finance_transactions(id) on delete set null;
create index finance_notification_pattern_transaction_idx on public.finance_notification_patterns(evidence_transaction_id);
create table public.finance_notification_learning_reviews (
 candidate_id uuid primary key references public.finance_candidate_transactions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 transaction_id uuid not null references public.finance_transactions(id) on delete cascade,
 pattern_id uuid references public.finance_notification_patterns(id) on delete set null,
 outcome text not null check (outcome in ('learned','not_learnable','source_changed','limit_reached')),
 created_at timestamptz not null default now()
);
create index finance_notification_learning_user_idx on public.finance_notification_learning_reviews(user_id);
create index finance_notification_learning_transaction_idx on public.finance_notification_learning_reviews(transaction_id);
create index finance_notification_learning_pattern_idx on public.finance_notification_learning_reviews(pattern_id);
alter table public.finance_notification_learning_reviews enable row level security;
revoke all on public.finance_notification_learning_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.finance_notification_learning_reviews to service_role;

create function finance_private.notification_definition_valid(d jsonb) returns boolean
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
   if k is null or k not in ('amount','date','time','text','reference') or k=any(kinds) or last_variable
    or exists(select 1 from jsonb_object_keys(p) x where x not in ('kind','field')) then return false; end if;
   kinds:=array_append(kinds,k); last_variable:=true;
   if p ? 'field' then
    if p->>'field' is null or p->>'field'=any(fields) or not (
     (k='amount' and p->>'field'='amount') or (k='date' and p->>'field'='transaction_date')
     or (k='text' and p->>'field' in ('merchant','payee_name')) or (k='reference' and p->>'field'='reference_number')
    ) then return false; end if;
    fields:=array_append(fields,p->>'field');
   end if;
  else return false; end if;
 end loop;
 return (literal_size between 4 and 500 or (d->>'match'='contains' and jsonb_array_length(d->'parts')=1 and d->'parts'->0->>'kind'='date'))
  and not ('merchant'=any(fields) and 'payee_name'=any(fields));
end $$;
revoke all on function finance_private.notification_definition_valid(jsonb) from public,anon,authenticated;
grant execute on function finance_private.notification_definition_valid(jsonb) to service_role;
alter table public.finance_notification_patterns add constraint finance_notification_definition_check
 check (finance_private.notification_definition_valid(definition) is true);

create function public.finance_confirm_notification_v1(p_user_id uuid,p_candidate_id uuid,p_expected_digest text,p_confirmation jsonb,p_learning jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.finance_candidate_transactions; e public.finance_notification_events; result jsonb;
 t uuid; pattern uuid; target_source uuid; learning_outcome text:='not_learnable';
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into c from public.finance_candidate_transactions where id=p_candidate_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance review item not found'; end if;
 select * into e from public.finance_notification_events where intake_item_id=c.intake_item_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance notification not found'; end if;
 if p_confirmation->>'p_confirmation_mode' is distinct from 'manual' then raise exception using errcode='22023',message='Manual confirmation required'; end if;
 if c.status<>'accepted' and (e.status<>'review' or e.body is null or p_expected_digest is distinct from e.payload_digest) then
  raise exception using errcode='40001',message='Notification changed during review';
 end if;
 target_source:=(p_confirmation->>'p_source_id')::uuid;
 result:=public.finance_confirm_candidate_v3(p_user_id,p_candidate_id,target_source,
  (p_confirmation->>'p_category_id')::uuid,p_confirmation->>'p_direction',(p_confirmation->>'p_amount')::numeric,
  p_confirmation->>'p_merchant',p_confirmation->>'p_payee_name',(p_confirmation->>'p_transaction_date')::date,
  p_confirmation->>'p_notes',p_confirmation->>'p_currency',p_confirmation->>'p_reference_number',
  coalesce((p_confirmation->>'p_allow_duplicate')::boolean,false),p_confirmation->>'p_duplicate_override_reason','manual');
 if c.status='accepted' or coalesce((result->>'confirmed')::boolean,false) is false then return result; end if;
 t:=(result->'transaction'->>'id')::uuid;
 if target_source<>e.source_id then learning_outcome:='source_changed';
 elsif p_learning is not null and p_learning<>'null'::jsonb then
  if jsonb_typeof(p_learning)<>'object' or finance_private.notification_definition_valid(p_learning->'definition') is distinct from true
   or length(coalesce(p_learning->>'format_key','')) not between 1 and 100
   or length(coalesce(p_learning->>'name','')) not between 1 and 100
   or p_learning->'definition' ? 'match' then
   raise exception using errcode='22023',message='Invalid notification learning pattern';
  end if;
  if (select count(*) from public.finance_notification_patterns where user_id=p_user_id and source_id=e.source_id)>=200
   and not exists(select 1 from public.finance_notification_patterns where user_id=p_user_id and source_id=e.source_id and source_package=e.source_package and format_key=p_learning->>'format_key') then
   learning_outcome:='limit_reached';
  else
   insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,evidence_transaction_id)
   values(p_user_id,e.source_id,e.source_package,p_learning->>'format_key',p_learning->>'name',p_learning->'definition','learned',t)
   on conflict(user_id,source_id,source_package,format_key) where user_id is not null do update
   set definition=excluded.definition,origin='learned',evidence_transaction_id=t,evidence_valid=true,
    revision=finance_notification_patterns.revision+1,updated_at=clock_timestamp()
   returning id into pattern;
   learning_outcome:='learned';
  end if;
 end if;
 insert into public.finance_notification_learning_reviews(candidate_id,user_id,transaction_id,pattern_id,outcome)
 values(p_candidate_id,p_user_id,t,pattern,learning_outcome);
 return result;
exception when lock_not_available then
 raise exception using errcode='40001',message='Finance data changed concurrently. Retry the action.';
end $$;
revoke all on function public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_confirm_notification_v1(uuid,uuid,text,jsonb,jsonb) to service_role;

create function finance_private.invalidate_notification_learning() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (old.amount,old.direction,old.merchant,old.payee_id,old.transaction_date,old.reference_number,old.source_id)
  is distinct from (new.amount,new.direction,new.merchant,new.payee_id,new.transaction_date,new.reference_number,new.source_id) then
  update public.finance_notification_patterns set evidence_valid=false,revision=revision+1,updated_at=clock_timestamp()
  where evidence_transaction_id=old.id and user_id=old.user_id and evidence_valid;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function finance_private.invalidate_notification_learning() from public,anon,authenticated;
grant execute on function finance_private.invalidate_notification_learning() to service_role;
create trigger invalidate_notification_learning before update or delete on public.finance_transactions
for each row execute function finance_private.invalidate_notification_learning();

create function public.finance_set_notification_pattern_v1(p_user_id uuid,p_source_id uuid,p_pattern_id uuid,p_is_active boolean,p_expected_revision integer)
returns public.finance_notification_patterns language plpgsql security invoker set search_path='' as $$
declare p public.finance_notification_patterns;
begin
 if p_is_active is null or p_expected_revision is null then raise exception using errcode='22023',message='Invalid pattern status'; end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 perform 1 from public.dim_finance_sources where id=p_source_id and user_id=p_user_id and not is_archived;
 if not found then raise exception using errcode='P0002',message='Finance source not found'; end if;
 select * into p from public.finance_notification_patterns where id=p_pattern_id
 and (user_id is null or (user_id=p_user_id and source_id=p_source_id)) for update;
 if not found then raise exception using errcode='P0002',message='Notification pattern not found'; end if;
 if p.revision<>p_expected_revision then raise exception using errcode='40001',message='Notification pattern changed'; end if;
 if p.user_id is null then
  if exists(select 1 from public.finance_notification_patterns where user_id=p_user_id and source_id=p_source_id and source_package=p.source_package and format_key=p.format_key) then
   raise exception using errcode='40001',message='Notification pattern changed';
  end if;
  insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,is_active)
  values(p_user_id,p_source_id,p.source_package,p.format_key,p.name,p.definition,'override',p_is_active) returning * into p;
 else
  update public.finance_notification_patterns set is_active=p_is_active,revision=revision+1,updated_at=clock_timestamp()
  where id=p.id returning * into p;
 end if;
 return p;
end $$;
revoke all on function public.finance_set_notification_pattern_v1(uuid,uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.finance_set_notification_pattern_v1(uuid,uuid,uuid,boolean,integer) to service_role;
notify pgrst,'reload schema';
