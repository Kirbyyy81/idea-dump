begin;
set local lock_timeout = '10s';

alter table public.finance_transactions add column is_split boolean not null default false;

create table finance_private.transaction_split_parts (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null,
    user_id uuid not null,
    position smallint not null check (position between 1 and 3),
    amount numeric not null check (amount between 0.01 and 999999999999.99 and scale(amount) <= 2),
    category_id uuid,
    notes text check (char_length(notes) <= 2500),
    unique (payment_id, position),
    unique (id, user_id),
    foreign key (payment_id, user_id) references public.finance_transactions(id, user_id) on delete cascade,
    foreign key (category_id, user_id) references public.dim_finance_categories(id, user_id) on delete set null (category_id)
);
create index transaction_split_parts_category on finance_private.transaction_split_parts(category_id, user_id);

create table finance_private.transaction_split_tags (
    part_id uuid not null,
    user_id uuid not null,
    tag_id uuid not null,
    primary key (part_id, tag_id),
    foreign key (part_id, user_id) references finance_private.transaction_split_parts(id, user_id) on delete cascade,
    foreign key (tag_id, user_id) references public.dim_finance_tags(id, user_id) on delete cascade
);
create index transaction_split_tags_tag on finance_private.transaction_split_tags(tag_id, user_id, part_id);
alter table finance_private.transaction_split_parts enable row level security;
alter table finance_private.transaction_split_tags enable row level security;
revoke all on finance_private.transaction_split_parts, finance_private.transaction_split_tags from public, anon, authenticated;
grant select, insert, update, delete on finance_private.transaction_split_parts, finance_private.transaction_split_tags to service_role;

-- The bank payment stays in finance_transactions. Only accounting and display
-- use the allocation entries. Intake never sees a partial amount or duplicate reference.
create view finance_private.ledger_entries with (security_invoker = true) as
    select t.id, t.user_id, t.source_id, t.category_id, t.direction, t.amount, t.currency,
        t.merchant, t.payee_id, t.reference_number, t.transaction_date, t.notes, t.status,
        t.created_at, t.transfer_id, t.foreign_amount, t.foreign_currency, null::uuid as split_payment_id
    from public.finance_transactions t
    where not t.is_split
    union all
    select p.id, t.user_id, t.source_id, p.category_id, t.direction, p.amount, t.currency,
        t.merchant, t.payee_id, t.reference_number, t.transaction_date, p.notes, t.status,
        t.created_at, null, null, null, t.id
    from finance_private.transaction_split_parts p
    join public.finance_transactions t on t.id=p.payment_id and t.user_id=p.user_id and t.is_split;

create view finance_private.ledger_entry_tags with (security_invoker = true) as
    select transaction_id as entry_id, user_id, tag_id from public.finance_transaction_tags
    union all
    select part_id, user_id, tag_id from finance_private.transaction_split_tags;

-- Scalar JSON relations keep the ledger view independent of PostgREST
-- relationship inference across the union of original rows and split rows.
create view public.finance_ledger_entries with (security_invoker = true) as
    select e.*,
        case when s.id is not null then jsonb_build_object('id',s.id,'name',s.name) end as finance_source,
        case when c.id is not null then jsonb_build_object('id',c.id,'name',c.name,'is_archived',c.is_archived) end as category,
        case when p.id is not null then jsonb_build_object('id',p.id,'name',p.name) end as finance_payee,
        case when tr.id is not null then jsonb_build_object(
            'id',tr.id,'created_at',tr.created_at,
            'outgoing_transaction_id',tr.outgoing_transaction_id,'incoming_transaction_id',tr.incoming_transaction_id,
            'outgoing_source',jsonb_build_object('id',outgoing.id,'name',outgoing.name),
            'incoming_source',jsonb_build_object('id',incoming.id,'name',incoming.name)
        ) end as transfer,
        coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'is_archived',d.is_archived) order by d.name,d.id)
            from finance_private.ledger_entry_tags lt join public.dim_finance_tags d on d.id=lt.tag_id and d.user_id=lt.user_id
            where lt.entry_id=e.id and lt.user_id=e.user_id), '[]') as tags
    from finance_private.ledger_entries e
    left join public.dim_finance_sources s on s.id=e.source_id and s.user_id=e.user_id
    left join public.dim_finance_categories c on c.id=e.category_id and c.user_id=e.user_id
    left join public.dim_finance_payees p on p.id=e.payee_id and p.user_id=e.user_id
    left join public.finance_internal_transfers tr on tr.id=e.transfer_id and tr.user_id=e.user_id
    left join public.dim_finance_sources outgoing on outgoing.id=tr.outgoing_source_id and outgoing.user_id=tr.user_id
    left join public.dim_finance_sources incoming on incoming.id=tr.incoming_source_id and incoming.user_id=tr.user_id;

revoke all on finance_private.ledger_entries, finance_private.ledger_entry_tags, public.finance_ledger_entries from public, anon, authenticated;
grant select on finance_private.ledger_entries, finance_private.ledger_entry_tags, public.finance_ledger_entries to service_role;

create function public.finance_tagged_ledger_entries(p_user_id uuid, p_tag_ids uuid[], p_mode text)
returns setof public.finance_ledger_entries language sql stable security invoker set search_path='' as $$
    select e.* from public.finance_ledger_entries e where e.user_id=p_user_id and (
        coalesce(cardinality(p_tag_ids),0)=0 or
        exists(select 1 from finance_private.ledger_entry_tags t
            where t.entry_id=e.id and t.user_id=e.user_id and t.tag_id=any(p_tag_ids)) = (p_mode='include')
    );
$$;

create function public.finance_get_transaction_split(p_user_id uuid, p_payment_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
    select snapshot || jsonb_build_object('version',md5(jsonb_build_array(t.updated_at,snapshot)::text))
    from public.finance_transactions t
    left join public.dim_finance_sources s on s.id=t.source_id and s.user_id=t.user_id
    left join public.dim_finance_payees p on p.id=t.payee_id and p.user_id=t.user_id
    cross join lateral (select jsonb_build_object(
        'payment',jsonb_build_object('id',t.id,'amount',t.amount::text,'currency',t.currency,'direction',t.direction,
            'party',coalesce(p.name,t.merchant),'source_name',s.name,'transaction_date',t.transaction_date,
            'reference_number',t.reference_number,'notes',t.notes,
            'category',(select jsonb_build_object('id',c.id,'name',c.name,'is_archived',c.is_archived)
                from public.dim_finance_categories c where c.id=t.category_id and c.user_id=t.user_id),
            'foreign_currency',t.foreign_currency,'foreign_amount',t.foreign_amount::text,
            'transfer_id',t.transfer_id,
            'tags',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'is_archived',d.is_archived) order by d.id)
                from public.finance_transaction_tags tt join public.dim_finance_tags d on d.id=tt.tag_id and d.user_id=tt.user_id
                where tt.transaction_id=t.id and tt.user_id=t.user_id),'[]')),
        'parts',coalesce((select jsonb_agg(jsonb_build_object(
            'id',part.id,'amount',part.amount::text,'notes',part.notes,
            'category',(select jsonb_build_object('id',c.id,'name',c.name,'is_archived',c.is_archived)
                from public.dim_finance_categories c where c.id=part.category_id and c.user_id=part.user_id),
            'tags',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'is_archived',d.is_archived) order by d.id)
                from finance_private.transaction_split_tags st join public.dim_finance_tags d on d.id=st.tag_id and d.user_id=st.user_id
                where st.part_id=part.id and st.user_id=part.user_id),'[]')) order by part.position)
            from finance_private.transaction_split_parts part where part.payment_id=t.id and part.user_id=t.user_id),'[]')
    ) as snapshot) data
    where t.id=p_payment_id and t.user_id=p_user_id and t.status='confirmed';
$$;

create function public.finance_save_transaction_split(p_user_id uuid, p_payment_id uuid, p_version text, p_parts jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
    payment public.finance_transactions;
    snapshot jsonb;
    part jsonb;
    amount_total numeric := 0;
    part_amount numeric;
    part_category uuid;
    tag_ids uuid[];
    part_number smallint := 0;
    saved_part_id uuid;
begin
    perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
    select * into payment from public.finance_transactions
        where id=p_payment_id and user_id=p_user_id and status='confirmed' for update;
    if not found then raise exception 'Payment not found' using errcode='P0002'; end if;
    if payment.transfer_id is not null then raise exception 'Internal transfers cannot be split' using errcode='23514'; end if;

    snapshot := public.finance_get_transaction_split(p_user_id,p_payment_id);
    if p_version is distinct from snapshot->>'version' then
        raise exception 'Payment changed' using errcode='40001';
    end if;
    if p_parts is not null and (jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts) not between 2 and 3) then
        raise exception 'Choose two or three parts' using errcode='22023';
    end if;

    perform finance_private.reconcile_transfer_budgets(p_user_id);
    if p_parts is null then
        delete from finance_private.transaction_split_parts where payment_id=p_payment_id and user_id=p_user_id;
        update public.finance_transactions set is_split=false,updated_at=clock_timestamp()
            where id=p_payment_id and user_id=p_user_id and is_split;
        return;
    end if;

    for part in select value from jsonb_array_elements(p_parts) loop
        if jsonb_typeof(part)<>'object' or jsonb_typeof(part->'amount') is distinct from 'string'
            or (part->>'amount') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
            or coalesce(jsonb_typeof(part->'notes'),'null') not in ('null','string')
            or char_length(part->>'notes')>2500
            or jsonb_typeof(part->'tag_ids') is distinct from 'array'
            or jsonb_array_length(part->'tag_ids')>50 then
            raise exception 'Invalid split part' using errcode='22023';
        end if;
        part_amount := (part->>'amount')::numeric;
        part_category := (part->>'category_id')::uuid;
        part_number := part_number + 1;
        amount_total := amount_total + part_amount;
        if part_amount<=0 then raise exception 'Part amounts must be positive' using errcode='22023'; end if;

        if part_category is not null and not exists (
            select 1 from public.dim_finance_categories c where c.user_id=p_user_id and c.id=part_category
                and (not c.is_archived or part_category=payment.category_id
                    or exists (select 1 from jsonb_array_elements(snapshot->'parts') old where old->'category'->>'id'=c.id::text))
        ) then raise exception 'Choose a valid category' using errcode='22023'; end if;

        select coalesce(array_agg(distinct value::uuid),'{}') into tag_ids from jsonb_array_elements_text(part->'tag_ids');
        if array_position(tag_ids,null) is not null or exists (
            select 1 from unnest(tag_ids) as chosen(id)
            where not exists (
                select 1 from public.dim_finance_tags t where t.user_id=p_user_id and t.id=chosen.id
                    and (not t.is_archived or exists (
                        select 1 from jsonb_array_elements(snapshot->'payment'->'tags') previous where previous->>'id'=t.id::text
                    ) or exists (
                        select 1 from jsonb_array_elements(snapshot->'parts') old
                        cross join lateral jsonb_array_elements(old->'tags') previous where previous->>'id'=t.id::text
                    ))
            )
        ) then raise exception 'Choose valid tags' using errcode='22023'; end if;

        insert into finance_private.transaction_split_parts(payment_id,user_id,position,amount,category_id,notes)
        values(p_payment_id,p_user_id,part_number,part_amount,part_category,nullif(btrim(part->>'notes'),''))
        on conflict(payment_id,position) do update set amount=excluded.amount,category_id=excluded.category_id,notes=excluded.notes
        returning id into saved_part_id;
        delete from finance_private.transaction_split_tags t where t.part_id=saved_part_id and t.user_id=p_user_id;
        insert into finance_private.transaction_split_tags(part_id,user_id,tag_id)
        select saved_part_id,p_user_id,chosen.id from unnest(tag_ids) as chosen(id);
    end loop;

    if amount_total<>payment.amount then
        raise exception 'Parts must add up to the original payment' using errcode='22023';
    end if;
    delete from finance_private.transaction_split_parts where payment_id=p_payment_id and user_id=p_user_id and position>part_number;
    update public.finance_transactions set is_split=true,updated_at=clock_timestamp()
        where id=p_payment_id and user_id=p_user_id;
end $$;

-- Retention cascades can remove a whole account. Normal ledger mutations must
-- restore a split before changing its original financial data or deleting it.
create function finance_private.guard_split_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
    if old.is_split and exists(select 1 from auth.users where id=old.user_id) then
        if tg_op='DELETE' then
            raise exception 'Remove the split before deleting the payment' using errcode='23514';
        elsif (old.amount,old.currency,old.direction,old.source_id,old.transaction_date,old.status,
                old.merchant,old.payee_id,old.reference_number,old.foreign_amount,old.foreign_currency,
                old.category_id,old.notes,old.transfer_id)
            is distinct from (new.amount,new.currency,new.direction,new.source_id,new.transaction_date,new.status,
                new.merchant,new.payee_id,new.reference_number,new.foreign_amount,new.foreign_currency,
                new.category_id,new.notes,new.transfer_id) then
            raise exception 'Remove the split before editing the original payment' using errcode='23514';
        end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
end $$;
create trigger finance_guard_split_payment before update or delete on public.finance_transactions
    for each row execute function finance_private.guard_split_payment();

-- Check the final state of the payment and its parts at commit, including
-- privileged writes outside the split RPC.
create function finance_private.check_split_total(p_id uuid, p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare payment public.finance_transactions; part_count integer; parts_total numeric;
begin
    select * into payment from public.finance_transactions where id=p_id and user_id=p_owner;
    if not found then return; end if;
    select count(*),sum(amount) into part_count,parts_total
        from finance_private.transaction_split_parts where payment_id=p_id and user_id=p_owner;
    if (payment.is_split and (part_count not between 2 and 3 or parts_total<>payment.amount
        or payment.status<>'confirmed' or payment.transfer_id is not null))
        or (not payment.is_split and part_count<>0) then
        raise exception 'Invalid split allocation' using errcode='23514';
    end if;
end $$;

create function finance_private.validate_split_parts() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if tg_op<>'DELETE' then perform finance_private.check_split_total(new.payment_id,new.user_id); end if;
    if tg_op='DELETE' or (tg_op='UPDATE' and (old.payment_id,old.user_id) is distinct from (new.payment_id,new.user_id)) then
        perform finance_private.check_split_total(old.payment_id,old.user_id);
    end if;
    return null;
end $$;

create function finance_private.validate_split_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    perform finance_private.check_split_total(new.id,new.user_id);
    return null;
end $$;
create constraint trigger finance_validate_split_parts after insert or update or delete on finance_private.transaction_split_parts
    deferrable initially deferred for each row execute function finance_private.validate_split_parts();
create constraint trigger finance_validate_split_payment_insert after insert on public.finance_transactions
    deferrable initially deferred for each row when (new.is_split) execute function finance_private.validate_split_payment();
create constraint trigger finance_validate_split_payment_update after update of is_split on public.finance_transactions
    deferrable initially deferred for each row execute function finance_private.validate_split_payment();

create or replace function public.finance_budget_matching(p_user_id uuid,p_budget_id uuid,p_start date,p_end date)
returns setof public.finance_transactions language sql stable security invoker set search_path='' as $$
    with filters as (
        select b.*,
            exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='source') has_sources,
            (b.include_uncategorised or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='category')) has_categories,
            exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='tag') has_tags
        from public.finance_budgets b where b.user_id=p_user_id and b.id=p_budget_id
    ), matched as (
        select t.* from finance_private.ledger_entries t cross join filters f
        cross join lateral(select
            exists(select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.source_id=t.source_id) source_match,
            (t.category_id is null and f.include_uncategorised or exists(
                select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.category_id=t.category_id)) category_match,
            exists(select 1 from public.finance_budget_filters x join finance_private.ledger_entry_tags tt
                on tt.user_id=x.user_id and tt.tag_id=x.tag_id
                where x.user_id=p_user_id and x.budget_id=f.id and x.kind='tag' and tt.entry_id=t.id) tag_match
        ) m
        where t.user_id=p_user_id and t.status='confirmed' and t.transfer_id is null
            and (p_start is null or t.transaction_date>=p_start) and (p_end is null or t.transaction_date<p_end)
            and finance_private.budget_filter_matches(f.filter_logic, f.filter_group,
                case when f.has_sources then m.source_match end,
                case when f.has_categories then m.category_match end,
                case when f.has_tags then m.tag_match end)
    )
    select (case when m.split_payment_id is null then payment else
        jsonb_populate_record(payment,jsonb_build_object('id',m.id,'amount',m.amount,
            'category_id',m.category_id,'notes',m.notes,'intake_item_id',null,
            'manual_idempotency_key',null,'foreign_amount',null,'foreign_currency',null)) end).*
    from matched m join public.finance_transactions payment
        on payment.id=coalesce(m.split_payment_id,m.id) and payment.user_id=m.user_id;
$$;

do $patch$
declare definition text; needle text;
begin
    definition := pg_get_functiondef('finance_private.transfer_entries(uuid,date,uuid,text)'::regprocedure);
    needle := 'where t.user_id=p_user and t.status=''confirmed''';
    if position(needle in definition)=0 then raise exception 'Missing transfer entry filter'; end if;
    execute replace(definition,needle,needle||'
        and not t.is_split');

    definition := pg_get_functiondef('public.finance_budget_detail(uuid,uuid,integer,integer,integer,integer,timestamp with time zone)'::regprocedure);
    -- The detail feed uses allocation IDs for display and a separate payment ID for navigation.
    needle := '''id'',x.id,''transaction_date'',x.transaction_date';
    if position(needle in definition)=0 then raise exception 'Missing budget detail projection'; end if;
    execute replace(definition,needle,'''id'',x.id,''split_payment_id'',(select part.payment_id from finance_private.transaction_split_parts part where part.id=x.id and part.user_id=x.user_id),''transaction_date'',x.transaction_date');

    definition := pg_get_functiondef('public.finance_bulk_transaction_tags(uuid,uuid[],uuid[],text)'::regprocedure);
    needle := ' if p_operation not in';
    if position(needle in definition)=0 then raise exception 'Missing bulk tag validation'; end if;
    execute replace(definition,needle,'
        if exists (select 1 from public.finance_transactions t where t.user_id=p_user_id and t.is_split and t.id=any(p_transactions)) then
            raise exception ''Edit the split to change its tags'' using errcode=''22023'';
        end if;'||needle);

    definition := pg_get_functiondef('finance_private.replace_transaction_tags(uuid,uuid,uuid[])'::regprocedure);
    needle := 'begin';
    if position(needle in definition)=0 then raise exception 'Missing transaction tag validation'; end if;
    execute replace(definition,needle,needle||'
        if exists (select 1 from public.finance_transactions t where t.user_id=p_user and t.is_split and t.id=p_transaction) then
            raise exception ''Edit the split to change its tags'' using errcode=''22023'';
        end if;');

    definition := pg_get_functiondef('public.finance_delete_category(uuid,uuid)'::regprocedure);
    needle := 'or exists (select 1 from public.finance_rules';
    if position(needle in definition)=0 then raise exception 'Missing category reference check'; end if;
    execute replace(definition,needle,'or exists (select 1 from finance_private.transaction_split_parts where user_id=p_user_id and category_id=p_category_id)
        '||needle);
end $patch$;

revoke all on function public.finance_tagged_ledger_entries(uuid,uuid[],text),
    public.finance_get_transaction_split(uuid,uuid), public.finance_save_transaction_split(uuid,uuid,text,jsonb),
    finance_private.guard_split_payment(), finance_private.check_split_total(uuid,uuid),
    finance_private.validate_split_parts(), finance_private.validate_split_payment() from public, anon, authenticated;
grant execute on function public.finance_tagged_ledger_entries(uuid,uuid[],text),
    public.finance_get_transaction_split(uuid,uuid), public.finance_save_transaction_split(uuid,uuid,text,jsonb),
    finance_private.guard_split_payment(), finance_private.check_split_total(uuid,uuid),
    finance_private.validate_split_parts(), finance_private.validate_split_payment() to service_role;
notify pgrst, 'reload schema';
commit;
