-- Narrow device credentials are usable only by companion routes.
create table public.companion_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
    label text not null check (length(label) between 1 and 80),
    created_at timestamptz not null default now(),
    last_seen_at timestamptz,
    revoked_at timestamptz,
    unique (id, user_id)
);
create index companion_devices_user_idx on public.companion_devices(user_id, created_at desc);
create table public.companion_pairing_requests (
    id uuid primary key,
    verifier_hash text not null unique check (verifier_hash ~ '^[a-f0-9]{64}$'),
    user_code text not null unique check (user_code ~ '^[A-F0-9]{8}$'),
    device_label text not null check (length(device_label) between 1 and 80),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '5 minutes'),
    approved_by uuid references auth.users(id) on delete cascade,
    device_id uuid references public.companion_devices(id) on delete cascade
);
alter table public.companion_devices enable row level security;
alter table public.companion_pairing_requests enable row level security;
revoke all on public.companion_devices, public.companion_pairing_requests from public, anon, authenticated;
grant select, insert, update, delete on public.companion_devices, public.companion_pairing_requests to service_role;

create function public.companion_begin_pairing_v1(p_id uuid, p_verifier_hash text, p_user_code text, p_device_label text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request public.companion_pairing_requests;
begin
    perform pg_advisory_xact_lock(381904, 1);
    select * into v_request from public.companion_pairing_requests where verifier_hash = p_verifier_hash;
    if found and v_request.expires_at > now() then
        return jsonb_build_object('id', v_request.id, 'user_code', v_request.user_code, 'expires_at', v_request.expires_at);
    end if;
    delete from public.companion_pairing_requests where expires_at < now() - interval '1 day';
    if (select count(*) from public.companion_pairing_requests where created_at > now() - interval '1 minute') >= 100 then
        raise exception using errcode = 'P0001', message = 'pairing_rate_limit';
    end if;
    insert into public.companion_pairing_requests(id, verifier_hash, user_code, device_label)
        values(p_id, p_verifier_hash, p_user_code, p_device_label) returning * into v_request;
    return jsonb_build_object('id', v_request.id, 'user_code', v_request.user_code, 'expires_at', v_request.expires_at);
end;
$$;

create function public.companion_approve_pairing_v1(p_user_id uuid, p_user_code text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_request public.companion_pairing_requests;
begin
    select * into v_request from public.companion_pairing_requests where user_code = p_user_code for update;
    if not found or v_request.expires_at <= now() then
        raise exception using errcode = 'P0001', message = 'pairing_expired';
    end if;
    if v_request.approved_by is not null and v_request.approved_by <> p_user_id then
        raise exception using errcode = 'P0001', message = 'pairing_conflict';
    end if;
    update public.companion_pairing_requests set approved_by = p_user_id where id = v_request.id;
end;
$$;

create function public.companion_complete_pairing_v1(p_id uuid, p_verifier_hash text, p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request public.companion_pairing_requests; v_device public.companion_devices;
begin
    select * into v_request from public.companion_pairing_requests
        where id = p_id and verifier_hash = p_verifier_hash for update;
    if not found or v_request.expires_at <= now() then
        raise exception using errcode = 'P0001', message = 'pairing_expired';
    end if;
    if v_request.approved_by is null then return jsonb_build_object('status', 'pending'); end if;
    if v_request.device_id is not null then
        select * into v_device from public.companion_devices
            where id = v_request.device_id and token_hash = p_token_hash and revoked_at is null;
        if not found then raise exception using errcode = 'P0001', message = 'pairing_conflict'; end if;
    else
        insert into public.companion_devices(user_id, token_hash, label)
            values(v_request.approved_by, p_token_hash, v_request.device_label) returning * into v_device;
        update public.companion_pairing_requests set device_id = v_device.id where id = p_id;
    end if;
    return jsonb_build_object('status', 'paired', 'device_id', v_device.id, 'user_id', v_device.user_id);
end;
$$;

-- This credential lookup is the authentication boundary, before any user-scoped query.
create function public.companion_authenticate_v1(p_token_hash text)
returns table(device_id uuid, user_id uuid) language sql security invoker set search_path = '' as $$
    update public.companion_devices set last_seen_at = now()
    where token_hash = p_token_hash and revoked_at is null returning id, user_id;
$$;

revoke all on function public.companion_begin_pairing_v1(uuid,text,text,text),
    public.companion_approve_pairing_v1(uuid,text),
    public.companion_complete_pairing_v1(uuid,text,text),
    public.companion_authenticate_v1(text) from public, anon, authenticated;
grant execute on function public.companion_begin_pairing_v1(uuid,text,text,text),
    public.companion_approve_pairing_v1(uuid,text),
    public.companion_complete_pairing_v1(uuid,text,text),
    public.companion_authenticate_v1(text) to service_role;
