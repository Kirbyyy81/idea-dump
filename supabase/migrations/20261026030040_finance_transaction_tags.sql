begin;
create table public.dim_finance_tags (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (name=btrim(name) and char_length(name) between 1 and 120),
 is_archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create unique index finance_tags_owner_name on public.dim_finance_tags(user_id,lower(name));
create table public.finance_transaction_tags (
 transaction_id uuid not null, tag_id uuid not null, user_id uuid not null,
 primary key(transaction_id,tag_id),
 foreign key(transaction_id,user_id) references public.finance_transactions(id,user_id) on delete cascade,
 foreign key(tag_id,user_id) references public.dim_finance_tags(id,user_id) on delete cascade
);
create index finance_transaction_tags_tag_owner on public.finance_transaction_tags(tag_id,user_id,transaction_id);
create index finance_transaction_tags_transaction_owner on public.finance_transaction_tags(transaction_id,user_id);
alter table public.dim_finance_tags enable row level security;
alter table public.finance_transaction_tags enable row level security;
create policy server_only_deny on public.dim_finance_tags as restrictive for all to anon,authenticated using(false) with check(false);
create policy server_only_deny on public.finance_transaction_tags as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on public.dim_finance_tags,public.finance_transaction_tags from public,anon,authenticated;
grant select,insert,update,delete on public.dim_finance_tags,public.finance_transaction_tags to service_role;

create function public.finance_save_tag(p_user_id uuid,p_id uuid default null,p_name text default null,p_archived boolean default null)
returns public.dim_finance_tags language plpgsql security invoker set search_path='' as $$
declare saved public.dim_finance_tags;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 if p_id is null then
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'Tag name must contain 1 to 120 characters' using errcode='22023'; end if;
  insert into public.dim_finance_tags(user_id,name) values(p_user_id,btrim(p_name))
  on conflict(user_id,lower(name)) do nothing returning * into saved;
  if not found then select * into saved from public.dim_finance_tags where user_id=p_user_id and lower(name)=lower(btrim(p_name)); end if;
 else
  select * into saved from public.dim_finance_tags where id=p_id and user_id=p_user_id for update;
  if not found then raise exception 'Tag not found' using errcode='P0002'; end if;
  update public.dim_finance_tags set name=coalesce(btrim(p_name),name),is_archived=coalesce(p_archived,is_archived),updated_at=clock_timestamp()
  where id=p_id and user_id=p_user_id returning * into saved;
 end if;
 return saved;
end $$;

create function finance_private.replace_transaction_tags(p_user uuid,p_transaction uuid,p_tags uuid[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_tags is null then return; end if;
 if cardinality(p_tags)>50 or array_position(p_tags,null) is not null then raise exception 'Choose up to 50 valid tags' using errcode='22023'; end if;
 if not exists(select 1 from public.finance_transactions where id=p_transaction and user_id=p_user and status='confirmed') then raise exception 'Transaction not found' using errcode='P0002'; end if;
 if exists(select 1 from unnest(p_tags) ids(id) where not exists(
  select 1 from public.dim_finance_tags d where d.id=ids.id and d.user_id=p_user and (not d.is_archived or exists(
   select 1 from public.finance_transaction_tags x where x.transaction_id=p_transaction and x.tag_id=d.id and x.user_id=p_user
  )))) then raise exception 'Tag is unavailable' using errcode='22023'; end if;
 delete from public.finance_transaction_tags where transaction_id=p_transaction and user_id=p_user and not(tag_id=any(p_tags));
 insert into public.finance_transaction_tags(transaction_id,tag_id,user_id)
 select p_transaction,id,p_user from (select distinct unnest(p_tags) id) ids on conflict do nothing;
end $$;

-- The original financial RPCs retain category learning, duplicate checks and locks.
create function public.finance_save_tagged_transaction(p_user_id uuid,p_input jsonb,p_transaction_id uuid default null)
returns public.finance_transactions language plpgsql security invoker set search_path='' as $$
declare saved public.finance_transactions; existing_id uuid; requested uuid[]; previous uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
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
 perform finance_private.replace_transaction_tags(p_user_id,saved.id,requested);
 return saved;
end $$;

create function public.finance_bulk_transaction_tags(p_user_id uuid,p_transactions uuid[],p_tags uuid[],p_operation text)
returns integer language plpgsql security invoker set search_path='' as $$
declare tx uuid; selected uuid[]; total integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 if p_operation not in ('add','remove') or p_operation is null or cardinality(p_transactions) not between 1 and 100
  or p_transactions is null or p_tags is null or cardinality(p_tags) not between 1 and 50
  or array_position(p_tags,null) is not null or array_position(p_transactions,null) is not null then raise exception 'Invalid bulk tag selection' using errcode='22023'; end if;
 select count(*) into total from public.finance_transactions where id=any(p_transactions) and user_id=p_user_id and status='confirmed';
 if total<>(select count(distinct id) from unnest(p_transactions) id) then raise exception 'Transaction not found' using errcode='P0002'; end if;
 if exists(select 1 from unnest(p_tags) ids(id) where not exists(select 1 from public.dim_finance_tags d where d.id=ids.id and d.user_id=p_user_id)) then raise exception 'Tag not found' using errcode='P0002'; end if;
 foreach tx in array p_transactions loop
  if p_operation='remove' then
   delete from public.finance_transaction_tags where transaction_id=tx and user_id=p_user_id and tag_id=any(p_tags);
  else
   select array(select distinct id from (select tag_id id from public.finance_transaction_tags where transaction_id=tx and user_id=p_user_id union select unnest(p_tags)) ids order by id) into selected;
   perform finance_private.replace_transaction_tags(p_user_id,tx,selected);
  end if;
 end loop;
 return total;
end $$;

create function public.finance_tagged_transactions(p_user_id uuid,p_tag_ids uuid[],p_mode text default 'include')
returns setof public.finance_transactions language sql stable security invoker set search_path='' as $$
 select t.* from public.finance_transactions t where t.user_id=p_user_id and
 (coalesce(cardinality(p_tag_ids),0)=0 or (p_mode='include' and exists(select 1 from public.finance_transaction_tags x where x.user_id=p_user_id and x.transaction_id=t.id and x.tag_id=any(p_tag_ids)))
 or (p_mode='exclude' and not exists(select 1 from public.finance_transaction_tags x where x.user_id=p_user_id and x.transaction_id=t.id and x.tag_id=any(p_tag_ids))));
$$;
revoke all on function public.finance_save_tag(uuid,uuid,text,boolean),public.finance_save_tagged_transaction(uuid,jsonb,uuid),
 public.finance_bulk_transaction_tags(uuid,uuid[],uuid[],text),public.finance_tagged_transactions(uuid,uuid[],text),finance_private.replace_transaction_tags(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.finance_save_tag(uuid,uuid,text,boolean),public.finance_save_tagged_transaction(uuid,jsonb,uuid),
 public.finance_bulk_transaction_tags(uuid,uuid[],uuid[],text),public.finance_tagged_transactions(uuid,uuid[],text),finance_private.replace_transaction_tags(uuid,uuid,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
