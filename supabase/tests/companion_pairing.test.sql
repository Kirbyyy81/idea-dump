\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
do $$
declare r jsonb; d uuid; n int;
begin
    for n in 1..30 loop
        if not public.companion_claim_pairing_attempt_v1('20000000-0000-4000-8000-000000000001') then
            raise exception 'pairing allowance exhausted early';
        end if;
    end loop;
    if public.companion_claim_pairing_attempt_v1('20000000-0000-4000-8000-000000000001') then
        raise exception 'pairing guesses not limited';
    end if;
    if not public.companion_claim_pairing_attempt_v1('20000000-0000-4000-8000-000000000002') then
        raise exception 'pairing limit crossed accounts';
    end if;
    if has_function_privilege('authenticated','public.companion_claim_pairing_attempt_v1(uuid)','EXECUTE')
        or has_table_privilege('anon','public.companion_pairing_attempts','SELECT') then
        raise exception 'pairing allowance permissions leaked';
    end if;
    r := public.companion_begin_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('a',64),'ABCD1234','Android 13');
    if r->>'user_code' <> 'ABCD1234' then raise exception 'start failed'; end if;
    r := public.companion_complete_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('a',64),repeat('b',64));
    if r->>'status' <> 'pending' then raise exception 'unapproved pairing completed'; end if;
    begin
        perform public.companion_complete_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('c',64),repeat('b',64));
        raise exception 'incorrect proof accepted';
    exception when raise_exception then
        if sqlerrm <> 'pairing_expired' then raise; end if;
    end;
    perform public.companion_approve_pairing_v1('20000000-0000-4000-8000-000000000001','ABCD1234');
    begin
        perform public.companion_approve_pairing_v1('20000000-0000-4000-8000-000000000002','ABCD1234');
        raise exception 'different account approved';
    exception when raise_exception then
        if sqlerrm <> 'pairing_conflict' then raise; end if;
    end;
    r := public.companion_complete_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('a',64),repeat('b',64));
    d := (r->>'device_id')::uuid;
    if r->>'user_id' <> '20000000-0000-4000-8000-000000000001' then raise exception 'wrong owner'; end if;
    r := public.companion_complete_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('a',64),repeat('b',64));
    if (r->>'device_id')::uuid <> d then raise exception 'replay duplicated device'; end if;
    begin
        perform public.companion_complete_pairing_v1('20000000-0000-4000-8000-000000000010',repeat('a',64),repeat('c',64));
        raise exception 'different credential rebound';
    exception when raise_exception then
        if sqlerrm <> 'pairing_conflict' then raise; end if;
    end;
    select count(*) into n from public.companion_authenticate_v1(repeat('b',64));
    if n <> 1 then raise exception 'valid credential rejected'; end if;
    update public.companion_devices set revoked_at = now() where id = d;
    select count(*) into n from public.companion_authenticate_v1(repeat('b',64));
    if n <> 0 then raise exception 'revoked credential accepted'; end if;
    if has_table_privilege('authenticated','public.companion_devices','SELECT')
        or has_function_privilege('anon','public.companion_approve_pairing_v1(uuid,text)','EXECUTE') then
        raise exception 'companion permissions leaked';
    end if;
end;
$$;
rollback;
