begin;
set local lock_timeout='10s';

create table public.finance_internal_transfer_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 outgoing_source_id uuid not null, incoming_source_id uuid not null,
 outgoing_party_kind text not null check(outgoing_party_kind in ('payee','merchant')),
 incoming_party_kind text not null check(incoming_party_kind in ('payee','merchant')),
 outgoing_party_key text not null check(length(outgoing_party_key) between 1 and 500),
 incoming_party_key text not null check(length(incoming_party_key) between 1 and 500),
 outgoing_party_name text not null, incoming_party_name text not null,
 is_active boolean not null default true, created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,user_id), check(outgoing_source_id<>incoming_source_id),
 unique(user_id,outgoing_source_id,incoming_source_id,outgoing_party_kind,outgoing_party_key,incoming_party_kind,incoming_party_key),
 foreign key(outgoing_source_id,user_id) references public.dim_finance_sources(id,user_id),
 foreign key(incoming_source_id,user_id) references public.dim_finance_sources(id,user_id)
);
create index finance_transfer_rules_incoming_source on public.finance_internal_transfer_rules(incoming_source_id,user_id);
create index finance_transfer_rules_outgoing_source on public.finance_internal_transfer_rules(outgoing_source_id,user_id);

create table public.finance_internal_transfers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 outgoing_transaction_id uuid not null unique, incoming_transaction_id uuid not null unique,
 outgoing_source_id uuid not null, incoming_source_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), automatic boolean not null default false,
 unique(id,user_id), check(outgoing_transaction_id<>incoming_transaction_id), check(outgoing_source_id<>incoming_source_id),
 foreign key(outgoing_transaction_id,user_id) references public.finance_transactions(id,user_id) deferrable initially deferred,
 foreign key(incoming_transaction_id,user_id) references public.finance_transactions(id,user_id) deferrable initially deferred,
 constraint finance_internal_transfers_outgoing_source_fkey foreign key(outgoing_source_id,user_id) references public.dim_finance_sources(id,user_id),
 constraint finance_internal_transfers_incoming_source_fkey foreign key(incoming_source_id,user_id) references public.dim_finance_sources(id,user_id)
);
create index finance_transfers_user on public.finance_internal_transfers(user_id,created_at);
create index finance_transfers_outgoing_transaction on public.finance_internal_transfers(outgoing_transaction_id,user_id);
create index finance_transfers_incoming_transaction on public.finance_internal_transfers(incoming_transaction_id,user_id);
create index finance_transfers_outgoing_source on public.finance_internal_transfers(outgoing_source_id,user_id);
create index finance_transfers_incoming_source on public.finance_internal_transfers(incoming_source_id,user_id);
alter table public.finance_transactions add column transfer_id uuid,
 add constraint finance_transactions_transfer_fkey foreign key(transfer_id,user_id)
 references public.finance_internal_transfers(id,user_id) deferrable initially deferred;
create index finance_transactions_transfer on public.finance_transactions(transfer_id,user_id) where transfer_id is not null;

create table public.finance_internal_transfer_dismissals (
 user_id uuid not null references auth.users(id) on delete cascade,
 outgoing_transaction_id uuid not null, incoming_transaction_id uuid not null,
 primary key(outgoing_transaction_id,incoming_transaction_id),
 foreign key(outgoing_transaction_id,user_id) references public.finance_transactions(id,user_id) on delete cascade,
 foreign key(incoming_transaction_id,user_id) references public.finance_transactions(id,user_id) on delete cascade
);
create index finance_transfer_dismissals_outgoing on public.finance_internal_transfer_dismissals(outgoing_transaction_id,user_id);
create index finance_transfer_dismissals_incoming on public.finance_internal_transfer_dismissals(incoming_transaction_id,user_id);
create index finance_transfer_dismissals_user on public.finance_internal_transfer_dismissals(user_id);

alter table public.finance_internal_transfers enable row level security;
alter table public.finance_internal_transfer_rules enable row level security;
alter table public.finance_internal_transfer_dismissals enable row level security;
create policy server_only_deny on public.finance_internal_transfers as restrictive for all to anon,authenticated using(false) with check(false);
create policy server_only_deny on public.finance_internal_transfer_rules as restrictive for all to anon,authenticated using(false) with check(false);
create policy server_only_deny on public.finance_internal_transfer_dismissals as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on public.finance_internal_transfers,public.finance_internal_transfer_rules,public.finance_internal_transfer_dismissals from public,anon,authenticated;
grant all on public.finance_internal_transfers,public.finance_internal_transfer_rules,public.finance_internal_transfer_dismissals to service_role;

-- Pair membership and accounting fields must agree even for a direct trusted write.
create function finance_private.validate_transfer_pair() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target uuid; pair public.finance_internal_transfers; outgoing public.finance_transactions; incoming public.finance_transactions;
begin
 if tg_table_name='finance_internal_transfers' then target:=case when tg_op='DELETE' then old.id else new.id end;
 else target:=case when tg_op='DELETE' then old.transfer_id else coalesce(new.transfer_id,old.transfer_id) end; end if;
 if target is null then return null; end if;
 select * into pair from public.finance_internal_transfers where id=target;
 if not found then return null; end if;
 select * into outgoing from public.finance_transactions where id=pair.outgoing_transaction_id and user_id=pair.user_id;
 select * into incoming from public.finance_transactions where id=pair.incoming_transaction_id and user_id=pair.user_id;
 if outgoing.id is null or incoming.id is null or outgoing.transfer_id is distinct from target or incoming.transfer_id is distinct from target
  or outgoing.status<>'confirmed' or incoming.status<>'confirmed' or outgoing.direction<>'expense' or incoming.direction<>'income'
  or outgoing.amount<>incoming.amount or outgoing.currency<>incoming.currency
  or outgoing.source_id<>pair.outgoing_source_id or incoming.source_id<>pair.incoming_source_id
  or (select count(*) from public.finance_transactions where transfer_id=target)<>2 then
  raise exception 'Invalid internal transfer pair' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger finance_transfer_pair_valid after insert or update on public.finance_internal_transfers
 deferrable initially deferred for each row execute function finance_private.validate_transfer_pair();
create constraint trigger finance_transfer_members_valid after insert or update or delete on public.finance_transactions
 deferrable initially deferred for each row execute function finance_private.validate_transfer_pair();

-- Auth retention cascades delete the owner first. Only this trusted trigger
-- needs definer access to check that absence; ordinary mutations stay guarded.
create function finance_private.guard_transfer_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
 if old.transfer_id is not null then
  if tg_op='DELETE' then raise exception 'Unlink the internal transfer before deleting either entry' using errcode='23514'; end if;
  if (old.amount,old.currency,old.direction,old.source_id,old.transaction_date,old.status,old.merchant,old.payee_id,old.reference_number,old.foreign_amount,old.foreign_currency)
   is distinct from (new.amount,new.currency,new.direction,new.source_id,new.transaction_date,new.status,new.merchant,new.payee_id,new.reference_number,new.foreign_amount,new.foreign_currency)
   or (new.transfer_id is not null and new.transfer_id<>old.transfer_id) then
   raise exception 'Unlink the internal transfer before changing its transaction details' using errcode='23514';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger finance_guard_transfer_member before update or delete on public.finance_transactions
 for each row execute function finance_private.guard_transfer_member();

create function finance_private.transfer_payload_valid(p jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare day date; amount numeric;
begin
 if jsonb_typeof(p) is distinct from 'object' or p->>'currency' is distinct from 'MYR'
  or coalesce(p->>'direction','') not in ('expense','income')
  or jsonb_typeof(p->'amount') is distinct from 'number'
  or coalesce(p->>'source_id','') !~ '^[0-9a-fA-F-]{36}$'
  or coalesce(p->>'transaction_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 amount:=(p->>'amount')::numeric; day:=(p->>'transaction_date')::date;
 return amount>0 and amount<=999999999999.99 and amount=round(amount,2)
  and day::text=p->>'transaction_date' and day<=(now() at time zone 'Asia/Kuala_Lumpur')::date
  and nullif(btrim(coalesce(nullif(p->>'payee_name',''),p->>'merchant')),'') is not null;
exception when invalid_text_representation or datetime_field_overflow then return false;
end $$;

create index finance_transfer_candidate_date on public.finance_candidate_transactions(user_id,(payload->>'transaction_date')) where status='pending';

-- No raw notification/OCR text is exposed. Posted timestamps survive raw-text cleanup.
create function finance_private.transfer_entries(p_user uuid,p_day date default null,p_id uuid default null,p_kind text default null) returns table(
 kind text,id uuid,version timestamptz,transaction_id uuid,transfer_id uuid,intake_id uuid,
 source_id uuid,direction text,amount numeric,currency text,transaction_date date,
 party_kind text,party_key text,party_name text,posted_at timestamptz,created_at timestamptz,payload jsonb
) language sql stable security invoker set search_path='' as $$
 select 'transaction',t.id,t.updated_at,t.id,t.transfer_id,t.intake_item_id,t.source_id,t.direction,t.amount,t.currency,t.transaction_date,
  case when t.payee_id is not null then 'payee' else 'merchant' end,
  finance_private.category_party_key(coalesce(payee.name,t.merchant)),coalesce(payee.name,t.merchant),e.posted_at,coalesce(i.created_at,t.created_at),
  to_jsonb(t)||jsonb_build_object('payee_name',payee.name)
 from public.finance_transactions t left join public.dim_finance_payees payee on payee.id=t.payee_id and payee.user_id=t.user_id
 left join public.finance_intake_items i on i.id=t.intake_item_id and i.user_id=t.user_id
 left join public.finance_notification_events e on e.intake_item_id=t.intake_item_id and e.user_id=t.user_id
 where t.user_id=p_user and t.status='confirmed'
  and (p_day is null or t.transaction_date between p_day-1 and p_day+1)
  and (p_id is null or t.id=p_id) and (p_kind is null or p_kind='transaction')
 union all
 select 'candidate',c.id,c.updated_at,null::uuid,null::uuid,c.intake_item_id,(p->>'source_id')::uuid,p->>'direction',(p->>'amount')::numeric,
  p->>'currency',(p->>'transaction_date')::date,case when nullif(p->>'payee_name','') is not null then 'payee' else 'merchant' end,
  finance_private.category_party_key(coalesce(nullif(p->>'payee_name',''),p->>'merchant')),coalesce(nullif(p->>'payee_name',''),p->>'merchant'),
  e.posted_at,c.created_at,p
 from public.finance_candidate_transactions c cross join lateral(select c.payload p) input
 left join public.finance_notification_events e on e.intake_item_id=c.intake_item_id and e.user_id=c.user_id
 where c.user_id=p_user and c.status='pending' and finance_private.transfer_payload_valid(p)
  and (p_day is null or p->>'transaction_date' between (p_day-1)::text and (p_day+1)::text)
  and (p_id is null or c.id=p_id) and (p_kind is null or p_kind='candidate')
  and not exists(select 1 from public.finance_transactions t where t.intake_item_id=c.intake_item_id and t.user_id=p_user);
$$;

create function finance_private.transfer_entry(p_user uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; saved uuid;
begin
 if p_kind='candidate' then
  select t.id into saved from public.finance_candidate_transactions c join public.finance_transactions t
   on t.intake_item_id=c.intake_item_id and t.user_id=c.user_id where c.id=p_id and c.user_id=p_user and c.status='accepted';
 end if;
 select to_jsonb(e) into result from finance_private.transfer_entries(p_user,null,coalesce(saved,p_id),case when saved is not null then 'transaction' else p_kind end) e
  where e.kind=case when saved is not null then 'transaction' else p_kind end and e.id=coalesce(saved,p_id);
 if result is null then raise exception 'Complete the transaction details before linking a transfer' using errcode='22023'; end if;
 return result;
end $$;

create function public.finance_internal_transfer_options(p_user_id uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; choices jsonb;
begin
 base:=finance_private.transfer_entry(p_user_id,p_kind,p_id);
 base:=base||jsonb_build_object('source_name',(select name from public.dim_finance_sources where id=(base->>'source_id')::uuid and user_id=p_user_id));
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('source_name',s.name) order by e.transaction_date desc,e.created_at desc,e.id),'[]') into choices
 from finance_private.transfer_entries(p_user_id,(base->>'transaction_date')::date) e join public.dim_finance_sources s on s.id=e.source_id and s.user_id=p_user_id
 where e.transfer_id is null and base->>'transfer_id' is null and e.direction<>base->>'direction'
  and e.amount=(base->>'amount')::numeric and e.currency=base->>'currency' and e.source_id<>(base->>'source_id')::uuid
  and abs(e.transaction_date-(base->>'transaction_date')::date)<=1;
 return jsonb_build_object('entry',base,'options',choices);
end $$;

-- Validate current extraction evidence independently of optional spending categories.
create function finance_private.transfer_notification_current(p_user uuid,e jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.finance_notification_events n
  where n.user_id=p_user and n.intake_item_id=(e->>'intake_id')::uuid and n.source_id=(e->>'source_id')::uuid
   and n.status in ('review','completed') and n.posted_at is not null)
 and (e->>'kind'='transaction' or (
  finance_private.notification_auto_eligible(e->'payload')
  and not exists(select 1 from jsonb_each(coalesce(e->'payload'->'notification_extraction'->'fields','{}')) f
   where not exists(select 1 from public.finance_notification_patterns r
    join public.finance_notification_events n on n.intake_item_id=(e->>'intake_id')::uuid and n.user_id=p_user
    where r.id::text=f.value->>'pattern_id' and r.revision::text=f.value->>'revision' and r.is_active and r.evidence_valid
     and r.source_package in ('*',n.source_package)
     and ((r.user_id=p_user and r.source_id=n.source_id)
      or (r.user_id is null and not exists(select 1 from public.finance_notification_patterns o
       where o.user_id=p_user and o.source_id=n.source_id and o.source_package=r.source_package and o.format_key=r.format_key)))))
  ));
$$;

-- Only the regular reviewed confirmation can create ledger entries. It retains
-- duplicate checks, foreign details and notification cleanup, without teaching.
create function finance_private.confirm_transfer_entry(p_user uuid,e jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p jsonb:=e->'payload'; result jsonb; saved uuid; foreign_value numeric;
begin
 if e->>'transaction_id' is not null then return (e->>'transaction_id')::uuid; end if;
 foreign_value:=finance_private.read_foreign_amount(p,'foreign_amount','foreign_currency');
 result:=public.finance_confirm_candidate_v3(p_user,(e->>'id')::uuid,(p->>'source_id')::uuid,(p->>'category_id')::uuid,
  p->>'direction',(p->>'amount')::numeric,p->>'merchant',p->>'payee_name',(p->>'transaction_date')::date,p->>'notes',
  p->>'currency',p->>'reference_number',false,null,'manual');
 if result->>'confirmed' is distinct from 'true' then raise exception 'Resolve the other duplicate before linking this transfer' using errcode='23514'; end if;
 result:=finance_private.attach_confirmed_foreign_details(p_user,result,foreign_value,p->>'foreign_currency');
 saved:=(result->'transaction'->>'id')::uuid;
 return saved;
end $$;

create function finance_private.reconcile_transfer_budgets(p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare budget record;
begin
 for budget in select id from public.finance_budgets where user_id=p_user and archived_at is null order by id loop
  perform public.finance_budget_reconcile(p_user,budget.id);
 end loop;
end $$;

create function public.finance_link_internal_transfer(p_user_id uuid,p_first jsonb,p_second jsonb,p_save_rule boolean default false,p_automatic boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb; b jsonb; outgoing jsonb; incoming jsonb; out_id uuid; in_id uuid; pair_id uuid; rule_id uuid; lock_entry jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 perform finance_private.reconcile_transfer_budgets(p_user_id);
 for lock_entry in select value from (values(p_first),(p_second)) entries(value) order by value->>'kind',value->>'id' loop
  if lock_entry->>'kind'='candidate' then
   perform 1 from public.finance_candidate_transactions where id=(lock_entry->>'id')::uuid and user_id=p_user_id for update nowait;
  elsif lock_entry->>'kind'='transaction' then
   perform 1 from public.finance_transactions where id=(lock_entry->>'id')::uuid and user_id=p_user_id for update nowait;
  else raise exception 'Invalid transfer entry' using errcode='22023'; end if;
 end loop;
 a:=finance_private.transfer_entry(p_user_id,p_first->>'kind',(p_first->>'id')::uuid);
 b:=finance_private.transfer_entry(p_user_id,p_second->>'kind',(p_second->>'id')::uuid);
 if a->>'transfer_id' is not null and a->>'transfer_id'=b->>'transfer_id' and a->>'id'<>b->>'id' then
  return jsonb_build_object('id',a->>'transfer_id'); end if;
 if (a->>'version')::timestamptz is distinct from (p_first->>'version')::timestamptz or (b->>'version')::timestamptz is distinct from (p_second->>'version')::timestamptz then
  raise exception 'Transaction details changed. Reload and select the pair again.' using errcode='40001'; end if;
 if a->>'transfer_id' is not null or b->>'transfer_id' is not null or a->>'direction'=b->>'direction'
  or a->>'source_id'=b->>'source_id' or (a->>'amount')::numeric<>(b->>'amount')::numeric or a->>'currency'<>b->>'currency'
  or abs((a->>'transaction_date')::date-(b->>'transaction_date')::date)>1 then
  raise exception 'Choose equal incoming and outgoing entries from different accounts' using errcode='22023'; end if;
 if exists(select 1 from public.dim_finance_sources s where s.user_id=p_user_id and s.id in ((a->>'source_id')::uuid,(b->>'source_id')::uuid) and s.is_archived) then
  raise exception 'Choose active Finance sources' using errcode='22023'; end if;
 outgoing:=case when a->>'direction'='expense' then a else b end;
 incoming:=case when a->>'direction'='income' then a else b end;
 out_id:=finance_private.confirm_transfer_entry(p_user_id,outgoing);
 in_id:=finance_private.confirm_transfer_entry(p_user_id,incoming);
 insert into public.finance_internal_transfers(user_id,outgoing_transaction_id,incoming_transaction_id,outgoing_source_id,incoming_source_id,automatic)
 values(p_user_id,out_id,in_id,(outgoing->>'source_id')::uuid,(incoming->>'source_id')::uuid,p_automatic) returning id into pair_id;
 update public.finance_transactions set transfer_id=pair_id,updated_at=clock_timestamp() where user_id=p_user_id and id in (out_id,in_id);
 delete from public.finance_category_evidence where user_id=p_user_id and transaction_id in (out_id,in_id);
 delete from public.finance_internal_transfer_dismissals where user_id=p_user_id and outgoing_transaction_id=out_id and incoming_transaction_id=in_id;
 if p_save_rule then
  if outgoing->>'party_key'='' or incoming->>'party_key'='' then raise exception 'Both entries need a sender or recipient to save a rule' using errcode='22023'; end if;
  insert into public.finance_internal_transfer_rules(user_id,outgoing_source_id,incoming_source_id,outgoing_party_kind,outgoing_party_key,
   incoming_party_kind,incoming_party_key,outgoing_party_name,incoming_party_name)
  values(p_user_id,(outgoing->>'source_id')::uuid,(incoming->>'source_id')::uuid,outgoing->>'party_kind',outgoing->>'party_key',
   incoming->>'party_kind',incoming->>'party_key',outgoing->>'party_name',incoming->>'party_name')
  on conflict(user_id,outgoing_source_id,incoming_source_id,outgoing_party_kind,outgoing_party_key,incoming_party_kind,incoming_party_key)
  do update set is_active=true,created_at=clock_timestamp(),updated_at=clock_timestamp() returning id into rule_id;
 end if;
 return jsonb_build_object('id',pair_id,'rule_id',rule_id,'outgoing_transaction_id',out_id,'incoming_transaction_id',in_id);
end $$;

create function public.finance_unlink_internal_transfer(p_user_id uuid,p_id uuid,p_version timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare pair public.finance_internal_transfers;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 perform finance_private.reconcile_transfer_budgets(p_user_id);
 select * into pair from public.finance_internal_transfers where id=p_id and user_id=p_user_id for update;
 if not found then raise exception 'Internal transfer not found' using errcode='P0002'; end if;
 if pair.created_at is distinct from p_version then raise exception 'Transfer changed. Reload and try again.' using errcode='40001'; end if;
 insert into public.finance_internal_transfer_dismissals(user_id,outgoing_transaction_id,incoming_transaction_id)
 values(p_user_id,pair.outgoing_transaction_id,pair.incoming_transaction_id) on conflict do nothing;
 update public.finance_transactions set transfer_id=null,updated_at=clock_timestamp() where transfer_id=pair.id and user_id=p_user_id;
 delete from public.finance_internal_transfers where id=pair.id and user_id=p_user_id;
end $$;

create function public.finance_internal_transfer_rules(p_user_id uuid,p_action text default 'list',p_id uuid default null,p_version timestamptz default null,p_active boolean default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_action<>'list' then
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  if not exists(select 1 from public.finance_internal_transfer_rules where id=p_id and user_id=p_user_id and updated_at=p_version) then
   raise exception 'Transfer rule changed. Reload and try again.' using errcode='40001'; end if;
  if p_action='delete' then delete from public.finance_internal_transfer_rules where id=p_id and user_id=p_user_id;
  elsif p_action='set' and p_active is not null then update public.finance_internal_transfer_rules set is_active=p_active,
   created_at=case when p_active and not is_active then clock_timestamp() else created_at end,updated_at=clock_timestamp() where id=p_id and user_id=p_user_id;
  else raise exception 'Invalid transfer rule action' using errcode='22023'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('outgoing_source_name',s.name,'incoming_source_name',d.name) order by r.created_at desc),'[]') into result
 from public.finance_internal_transfer_rules r join public.dim_finance_sources s on s.id=r.outgoing_source_id and s.user_id=r.user_id
 join public.dim_finance_sources d on d.id=r.incoming_source_id and d.user_id=r.user_id where r.user_id=p_user_id;
 return result;
end $$;

create function finance_private.automatic_transfer_matches(p_user uuid,base jsonb) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(e) from finance_private.transfer_entries(p_user,(base->>'transaction_date')::date) e
 join public.dim_finance_sources source on source.id=e.source_id and source.user_id=p_user and not source.is_archived
 where e.transfer_id is null and base->>'transfer_id' is null and e.direction<>base->>'direction'
  and e.amount=(base->>'amount')::numeric and e.currency=base->>'currency' and e.source_id<>(base->>'source_id')::uuid
  and e.posted_at between (base->>'posted_at')::timestamptz-interval '10 minutes' and (base->>'posted_at')::timestamptz+interval '10 minutes'
  and finance_private.transfer_notification_current(p_user,to_jsonb(e)) and finance_private.transfer_notification_current(p_user,base)
  and not exists(select 1 from public.finance_internal_transfer_dismissals x where x.user_id=p_user
   and ((x.outgoing_transaction_id=e.transaction_id and x.incoming_transaction_id=(base->>'transaction_id')::uuid)
    or (x.incoming_transaction_id=e.transaction_id and x.outgoing_transaction_id=(base->>'transaction_id')::uuid)))
  and exists(select 1 from public.finance_internal_transfer_rules r
   join public.dim_finance_sources s on s.id=(base->>'source_id')::uuid and s.user_id=p_user and not s.is_archived
   where r.user_id=p_user and r.is_active and e.created_at>=r.created_at and (base->>'created_at')::timestamptz>=r.created_at
    and r.outgoing_source_id=case when e.direction='expense' then e.source_id else (base->>'source_id')::uuid end
    and r.incoming_source_id=case when e.direction='income' then e.source_id else (base->>'source_id')::uuid end
    and r.outgoing_party_kind=case when e.direction='expense' then e.party_kind else base->>'party_kind' end
    and r.outgoing_party_key=case when e.direction='expense' then e.party_key else base->>'party_key' end
    and r.incoming_party_kind=case when e.direction='income' then e.party_kind else base->>'party_kind' end
    and r.incoming_party_key=case when e.direction='income' then e.party_key else base->>'party_key' end);
$$;

create function finance_private.auto_link_internal_transfer(p_user uuid,p_candidate uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare base jsonb; other jsonb; matches jsonb[]; reverse_matches jsonb[]; result jsonb; c public.finance_candidate_transactions; saved public.finance_transactions;
begin
 base:=finance_private.transfer_entry(p_user,'candidate',p_candidate);
 if base->>'transfer_id' is not null then return null; end if;
 select array_agg(x) into matches from finance_private.automatic_transfer_matches(p_user,base) x;
 if coalesce(cardinality(matches),0)=0 then return null; end if;
 select * into c from public.finance_candidate_transactions where id=p_candidate and user_id=p_user;
 if cardinality(matches)<>1 then return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
 other:=matches[1];
 select array_agg(x) into reverse_matches from finance_private.automatic_transfer_matches(p_user,other) x;
 if coalesce(cardinality(reverse_matches),0)<>1 then return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
 result:=public.finance_link_internal_transfer(p_user,base,other,false,true);
 select * into saved from public.finance_transactions where user_id=p_user and intake_item_id=(base->>'intake_id')::uuid;
 return jsonb_build_object('confirmed',true,'transfer_id',result->>'id','transaction',to_jsonb(saved));
exception when invalid_parameter_value or invalid_text_representation or foreign_key_violation or check_violation or no_data_found then
 return null;
end $$;

-- Transfer legs cannot support future spending category assignments.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('finance_private.teach_category(uuid,uuid)'::regprocedure);
 needle:='if not found or t.category_id is null then return; end if;';
 if position(needle in definition)=0 then raise exception 'Category teaching hook missing'; end if;
 execute replace(definition,needle,'if not found or t.category_id is null or t.transfer_id is not null then return; end if;');

 definition:=pg_get_functiondef('public.finance_budget_matching(uuid,uuid,date,date)'::regprocedure);
 needle:='t.status=''confirmed''';
 if position(needle in definition)=0 then raise exception 'Budget matching hook missing'; end if;
 execute replace(definition,needle,needle||' and t.transfer_id is null');

 -- Opposite account movements are not weak amount/date duplicates. Hash
 -- evidence still detects a reimport with an incorrectly parsed direction.
 definition:=pg_get_functiondef('public.finance_confirm_candidate(uuid,uuid,uuid,uuid,text,numeric,text,date,text,text,text,boolean,text,text)'::regprocedure);
 needle:='transactions.status = ''confirmed''';
 if position(needle in definition)=0 then raise exception 'Duplicate confirmation hook missing'; end if;
 execute replace(definition,needle,needle||E'\n        and (transactions.source_id=p_source_id or transactions.direction=p_direction\n          or (current_ocr_text_hash is not null and existing_intakes.ocr_text_hash=current_ocr_text_hash))');

 definition:=pg_get_functiondef('finance_private.auto_confirm_notification(uuid,uuid)'::regprocedure);
 needle:='declare c public.finance_candidate_transactions;';
 if position(needle in definition)=0 then raise exception 'Notification declaration hook missing'; end if;
 definition:=replace(definition,needle,'declare transfer_result jsonb; c public.finance_candidate_transactions;');
 needle:=' select * into c from public.finance_candidate_transactions';
 if position(needle in definition)=0 then raise exception 'Notification transfer hook missing'; end if;
 definition:=replace(definition,needle,E' transfer_result:=finance_private.auto_link_internal_transfer(p_user_id,p_candidate_id);\n if transfer_result is not null then return transfer_result; end if;\n'||needle);
 execute definition;
end $patch$;

do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='finance_private' and p.proname in ('validate_transfer_pair','guard_transfer_member','transfer_payload_valid','transfer_entries','transfer_entry','transfer_notification_current','confirm_transfer_entry','reconcile_transfer_budgets','automatic_transfer_matches','auto_link_internal_transfer'))
 or (n.nspname='public' and p.proname in ('finance_internal_transfer_options','finance_link_internal_transfer','finance_unlink_internal_transfer','finance_internal_transfer_rules')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $permissions$;
notify pgrst,'reload schema';
commit;
