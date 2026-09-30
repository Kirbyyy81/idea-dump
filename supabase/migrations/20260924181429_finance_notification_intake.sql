create table public.finance_notification_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    device_id uuid not null,
    client_event_id uuid not null,
    payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
    source_id uuid not null references public.dim_finance_sources(id),
    source_package text not null check (source_package in ('my.rytbank.app','my.com.tngdigital.ewallet')),
    notification_key_hash text not null check (notification_key_hash ~ '^[a-f0-9]{64}$'),
    captured_at timestamptz not null,
    posted_at timestamptz not null,
    title text check (length(title) <= 1024),
    body text check (length(body) <= 8192),
    subtext text check (length(subtext) <= 1024),
    date_provenance text not null check (date_provenance in ('notification_text','posted_at','unavailable')),
    status text not null check (status in ('review','ignored','completed','rejected','duplicate')),
    intake_item_id uuid unique references public.finance_intake_items(id) on delete cascade,
    created_at timestamptz not null default now(),
    raw_deleted_at timestamptz,
    unique(user_id, client_event_id),
    foreign key(device_id, user_id) references public.companion_devices(id,user_id),
    check ((status = 'review' and body is not null and intake_item_id is not null)
        or (status <> 'review' and title is null and body is null and subtext is null and raw_deleted_at is not null))
);
create index finance_notification_device_idx on public.finance_notification_events(device_id,created_at);
create index finance_notification_source_idx on public.finance_notification_events(source_id);
alter table public.finance_notification_events enable row level security;
revoke all on public.finance_notification_events from public,anon,authenticated;
grant select,insert,update,delete on public.finance_notification_events to service_role;

create function public.finance_accept_notification_v1(p_user_id uuid,p_device_id uuid,p_event jsonb,p_digest text,p_parsed jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.finance_notification_events; i uuid; c uuid; result_status text;
begin
    if not public.finance_user_can_access_module_v1(p_user_id,'finance') then raise exception using errcode='42501',message='Finance access denied'; end if;
    -- Lock against revocation, then serialize retries for this owner's client event.
    perform 1 from public.companion_devices where id=p_device_id and user_id=p_user_id and revoked_at is null for share;
    if not found then raise exception using errcode='P0001',message='device_revoked'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || (p_event->>'client_event_id'),0));
    select * into e from public.finance_notification_events
        where user_id=p_user_id and client_event_id=(p_event->>'client_event_id')::uuid;
    if found then
        if e.payload_digest <> p_digest then raise exception using errcode='P0001',message='event_conflict'; end if;
        return jsonb_build_object('event_id',e.id,'status',e.status,'intake_item_id',e.intake_item_id,'replayed',true);
    end if;
    perform 1 from public.dim_finance_sources where id=(p_event->>'source_id')::uuid and user_id=p_user_id and not is_archived for share;
    if not found then raise exception using errcode='P0001',message='source_unavailable'; end if;
    if (select count(*) from public.finance_notification_events where device_id=p_device_id and created_at>now()-interval '1 minute') >= 120 then
        raise exception using errcode='P0001',message='notification_rate_limit';
    end if;
    result_status := p_parsed->>'status';
    if result_status not in ('review','ignored') or result_status is null then raise exception 'Invalid notification status'; end if;
    if result_status='review' then
        if jsonb_typeof(p_parsed->'payload') <> 'object' or p_parsed->'payload'->>'source_id' <> p_event->>'source_id' then
            raise exception 'Invalid notification payload';
        end if;
        insert into public.finance_intake_items(user_id,source,status,processed_at,detected_source_id)
            values(p_user_id,'notification','review',now(),(p_event->>'source_id')::uuid) returning id into i;
    end if;
    insert into public.finance_notification_events(user_id,device_id,client_event_id,payload_digest,source_id,source_package,
        notification_key_hash,captured_at,posted_at,title,body,subtext,date_provenance,status,intake_item_id,raw_deleted_at)
    values(p_user_id,p_device_id,(p_event->>'client_event_id')::uuid,p_digest,(p_event->>'source_id')::uuid,p_event->>'source_package',
        p_event->>'notification_key_hash',(p_event->>'captured_at')::timestamptz,(p_event->'notification'->>'posted_at')::timestamptz,
        case when result_status='review' then p_event->'notification'->>'title' end,
        case when result_status='review' then p_event->'notification'->>'text' end,
        case when result_status='review' then p_event->'notification'->>'subtext' end,
        p_parsed->>'date_provenance',result_status,i,case when result_status='ignored' then now() end) returning * into e;
    if result_status='review' then
        insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,confidence,matched_rule_id,
            duplicate_outcome,duplicate_score,duplicate_signals,duplicate_explanation,duplicate_checked_at)
        values(p_user_id,i,p_parsed->'payload',null,nullif(p_parsed->>'matched_rule_id','')::uuid,
            coalesce(p_parsed->>'duplicate_outcome','none'),(p_parsed->>'duplicate_score')::numeric,
            coalesce(array(select jsonb_array_elements_text(p_parsed->'duplicate_signals')),'{}'::text[]),
            p_parsed->>'duplicate_explanation',now()) returning id into c;
    end if;
    return jsonb_build_object('event_id',e.id,'status',e.status,'intake_item_id',i,'candidate_id',c,'replayed',false);
end;
$$;
revoke all on function public.finance_accept_notification_v1(uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_accept_notification_v1(uuid,uuid,jsonb,text,jsonb) to service_role;

-- Existing reviewed confirmation/rejection RPCs retain their locking and duplicate rules.
create function public.finance_finalize_notification_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if new.source='notification' and new.status in ('completed','rejected','duplicate') then
        update public.finance_notification_events set title=null,body=null,subtext=null,status=new.status,raw_deleted_at=now()
            where intake_item_id=new.id and user_id=new.user_id;
    end if;
    return new;
end;
$$;
create trigger finance_finalize_notification after update of status on public.finance_intake_items
    for each row execute function public.finance_finalize_notification_v1();

alter table public.finance_transactions drop constraint finance_transactions_source_check;
alter table public.finance_transactions add constraint finance_transactions_source_check
    check(source in ('manual','screenshot','notification'));
create function public.finance_notification_transaction_source_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if exists(select 1 from public.finance_intake_items where id=new.intake_item_id and user_id=new.user_id and source='notification') then
        new.source := 'notification';
    elsif new.source='notification' then
        raise exception 'Notification transaction requires an owned notification intake';
    end if;
    return new;
end;
$$;
create trigger finance_notification_transaction_source before insert or update on public.finance_transactions
    for each row execute function public.finance_notification_transaction_source_v1();
create function public.finance_notification_manual_review_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if exists(select 1 from public.finance_intake_items where id=new.intake_item_id and user_id=new.user_id and source='notification') then
        new.confidence := null;
    end if;
    return new;
end;
$$;
create trigger finance_notification_manual_review before insert or update on public.finance_candidate_transactions
    for each row execute function public.finance_notification_manual_review_v1();
revoke all on function public.finance_finalize_notification_v1(),
    public.finance_notification_transaction_source_v1(),public.finance_notification_manual_review_v1() from public,anon,authenticated;
grant execute on function public.finance_finalize_notification_v1(),
    public.finance_notification_transaction_source_v1(),public.finance_notification_manual_review_v1() to service_role;
