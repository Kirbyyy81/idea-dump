-- Commit each lookup allowance separately so failed code guesses consume their allowance.
create table public.companion_pairing_attempts (
    user_id uuid not null references auth.users(id) on delete cascade,
    window_start timestamptz not null,
    attempts integer not null check (attempts between 1 and 31),
    primary key (user_id, window_start)
);
create index companion_pairing_attempts_window_idx on public.companion_pairing_attempts(window_start);
alter table public.companion_pairing_attempts enable row level security;
revoke all on public.companion_pairing_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.companion_pairing_attempts to service_role;

create function public.companion_claim_pairing_attempt_v1(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_attempts integer;
begin
    delete from public.companion_pairing_attempts where window_start < now() - interval '1 day';
    insert into public.companion_pairing_attempts(user_id, window_start, attempts)
        values (p_user_id, date_trunc('minute', now()), 1)
    on conflict (user_id, window_start) do update
        set attempts = least(public.companion_pairing_attempts.attempts + 1, 31)
    returning attempts into v_attempts;
    return v_attempts <= 30;
end;
$$;
revoke all on function public.companion_claim_pairing_attempt_v1(uuid) from public, anon, authenticated;
grant execute on function public.companion_claim_pairing_attempt_v1(uuid) to service_role;
