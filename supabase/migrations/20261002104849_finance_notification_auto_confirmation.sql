-- Complete notifications can confirm without the screenshot confidence/category gate.
-- Keep all writes behind server-only RPCs and the existing ledger duplicate lock.
create function finance_private.notification_auto_eligible(p jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare amount numeric; transaction_day date; field text;
begin
 if jsonb_typeof(p) is distinct from 'object'
  or jsonb_typeof(p->'amount') is distinct from 'number'
  or p->>'currency' is distinct from 'MYR'
  or coalesce(p->>'direction','') not in ('expense','income')
  or coalesce(p->>'transaction_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or p->'notification_extraction'->>'version' is distinct from '1'
  or p->'notification_extraction'->'conflicts' is distinct from '[]'::jsonb
  or coalesce(p->'notification_extraction'->>'date_provenance','') not in ('notification_text','posted_at')
  then return false; end if;
 amount:=(p->>'amount')::numeric;
 transaction_day:=(p->>'transaction_date')::date;
 if amount<=0 or amount>999999999999.99 or amount<>round(amount,2)
  or transaction_day::text<>p->>'transaction_date'
  or transaction_day>(now() at time zone 'Asia/Kuala_Lumpur')::date then return false; end if;
 foreach field in array array['merchant','payee_name','reference_number','notes'] loop
  if p->field is not null and p->field<>'null'::jsonb and jsonb_typeof(p->field)<>'string' then return false; end if;
  if length(btrim(p->>field))>(case field when 'notes' then 2500 when 'reference_number' then 200 else 500 end) then return false; end if;
 end loop;
 if nullif(btrim(p->>'merchant'),'') is null and nullif(btrim(p->>'payee_name'),'') is null then return false; end if;
 return true;
exception when invalid_text_representation or datetime_field_overflow then return false;
end $$;
revoke all on function finance_private.notification_auto_eligible(jsonb) from public,anon,authenticated;
grant execute on function finance_private.notification_auto_eligible(jsonb) to service_role;

-- Patch only the reviewed automatic gate, retaining all subsequent validation,
-- locking, duplicate assessment, payee resolution and confirmation behavior.
do $patch$
declare definition text; before_gate text; after_gate text; signature regprocedure;
begin
 signature:='public.finance_confirm_candidate(uuid,uuid,uuid,uuid,text,numeric,text,date,text,text,text,boolean,text,text)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_gate:=E'  if p_confirmation_mode = ''automatic'' then\n    if candidate_row.confidence is null';
 after_gate:=$gate$  if p_confirmation_mode = 'automatic' and intake_row.source = 'notification' then
    if not finance_private.notification_auto_eligible(candidate_row.payload)
      or (candidate_row.payload->>'source_id')::uuid is distinct from p_source_id
      or (candidate_row.payload->>'amount')::numeric is distinct from p_amount
      or candidate_row.payload->>'direction' is distinct from p_direction
      or nullif(btrim(candidate_row.payload->>'merchant'),'') is distinct from nullif(btrim(p_merchant),'')
      or (candidate_row.payload->>'transaction_date')::date is distinct from p_transaction_date
      or not exists(select 1 from public.finance_notification_events e
        where e.user_id=p_user_id and e.intake_item_id=intake_row.id and e.source_id=p_source_id and e.status='review')
      then raise exception using errcode='23514',message='Notification needs review before confirmation'; end if;
  elsif p_confirmation_mode = 'automatic' then
    if candidate_row.confidence is null$gate$;
 if position(before_gate in definition)=0 then raise exception 'Expected automatic confirmation gate not found'; end if;
 execute replace(definition,before_gate,after_gate);

 signature:='public.finance_confirm_candidate_v3(uuid,uuid,uuid,uuid,text,numeric,text,text,date,text,text,text,boolean,text,text)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_gate:='  was_already_accepted := found and candidate_row.status = ''accepted'';';
 after_gate:=$gate$  was_already_accepted := found and candidate_row.status = 'accepted';
  if not was_already_accepted and p_confirmation_mode='automatic'
    and exists(select 1 from public.finance_intake_items where id=candidate_row.intake_item_id and user_id=p_user_id and source='notification')
    and nullif(btrim(p_payee_name),'') is distinct from nullif(btrim(candidate_row.payload->>'payee_name'),'') then
    raise exception using errcode='23514',message='Notification payee changed before automatic confirmation';
  end if;$gate$;
 if position(before_gate in definition)=0 then raise exception 'Expected payee confirmation gate not found'; end if;
 execute replace(definition,before_gate,after_gate);
end $patch$;

create function finance_private.auto_confirm_notification(p_user_id uuid,p_candidate_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.finance_candidate_transactions; e public.finance_notification_events; p jsonb; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into c from public.finance_candidate_transactions where id=p_candidate_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance review item not found'; end if;
 select * into e from public.finance_notification_events where intake_item_id=c.intake_item_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance notification not found'; end if;
 p:=c.payload;
 if c.status<>'pending' or e.status<>'review' or not finance_private.notification_auto_eligible(p) then
  return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
 -- Rules may have been disabled or invalidated after preparation.
 if exists (
  select 1 from jsonb_each(coalesce(p->'notification_extraction'->'fields','{}')) f
  where not exists(select 1 from public.finance_notification_patterns r
   where r.id::text=f.value->>'pattern_id' and r.revision::text=f.value->>'revision' and r.is_active and r.evidence_valid
    and r.source_package in ('*',e.source_package)
    and ((r.user_id=p_user_id and r.source_id=e.source_id)
      or (r.user_id is null and not exists(select 1 from public.finance_notification_patterns o
        where o.user_id=p_user_id and o.source_id=e.source_id and o.source_package=r.source_package and o.format_key=r.format_key))))
 ) then return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
 begin
  -- No learning wrapper: an automatic result is not a human-confirmed example.
  result:=public.finance_confirm_candidate_v3(p_user_id,c.id,(p->>'source_id')::uuid,(p->>'category_id')::uuid,
   p->>'direction',(p->>'amount')::numeric,p->>'merchant',p->>'payee_name',(p->>'transaction_date')::date,
   p->>'notes',p->>'currency',p->>'reference_number',false,null,'automatic');
 exception when invalid_parameter_value or invalid_text_representation or foreign_key_violation or check_violation or no_data_found then
  return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c));
 end;
 if result->>'confirmed'='true' then
  insert into public.finance_processing_events(user_id,intake_item_id,event_type,detail)
  values(p_user_id,c.intake_item_id,'notification_auto_confirmed',jsonb_build_object(
   'candidate_id',c.id,'transaction_id',result->'transaction'->>'id','mode','automatic'));
 end if;
 return result;
end $$;
revoke all on function finance_private.auto_confirm_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function finance_private.auto_confirm_notification(uuid,uuid) to service_role;

create function public.finance_accept_notification_v2(p_user_id uuid,p_device_id uuid,p_event jsonb,p_digest text,p_parsed jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare accepted jsonb; confirmed jsonb;
begin
 -- Take the ledger lock before event/device/candidate locks on every automatic path.
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 accepted:=public.finance_accept_notification_v1(p_user_id,p_device_id,p_event,p_digest,p_parsed);
 -- Upload replay must not reinterpret or auto-confirm an existing pending item.
 if accepted->>'status'='review' and accepted->>'replayed'='false' then
  confirmed:=finance_private.auto_confirm_notification(p_user_id,(accepted->>'candidate_id')::uuid);
  if confirmed->>'confirmed'='true' then
   accepted:=accepted||jsonb_build_object('status','completed');
  end if;
 end if;
 return accepted;
exception when lock_not_available then
 raise exception using errcode='40001',message='Finance data changed concurrently. Retry the action.';
end $$;
revoke all on function public.finance_accept_notification_v2(uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_accept_notification_v2(uuid,uuid,jsonb,text,jsonb) to service_role;

create function public.finance_retry_notification_v1(p_user_id uuid,p_candidate_id uuid,p_expected_digest text,p_parsed jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.finance_candidate_transactions; e public.finance_notification_events; result jsonb;
begin
 if not public.finance_user_can_access_module_v1(p_user_id,'finance') then raise exception using errcode='42501',message='Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into c from public.finance_candidate_transactions where id=p_candidate_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance review item not found'; end if;
 select * into e from public.finance_notification_events where intake_item_id=c.intake_item_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance notification not found'; end if;
 if c.status<>'pending' or e.status<>'review' or p_expected_digest is distinct from e.payload_digest then
  raise exception using errcode='40001',message='Notification changed during review'; end if;
 if p_parsed->>'status' is distinct from 'review' or jsonb_typeof(p_parsed->'payload') is distinct from 'object'
  or p_parsed->'payload'->>'source_id' is distinct from e.source_id::text then
  raise exception using errcode='22023',message='Invalid notification retry'; end if;
 update public.finance_candidate_transactions set payload=p_parsed->'payload',confidence=null,
  matched_rule_id=nullif(p_parsed->>'matched_rule_id','')::uuid,
  duplicate_outcome=coalesce(p_parsed->>'duplicate_outcome','none'),duplicate_score=(p_parsed->>'duplicate_score')::numeric,
  duplicate_signals=coalesce(array(select jsonb_array_elements_text(p_parsed->'duplicate_signals')),'{}'::text[]),
  duplicate_explanation=p_parsed->>'duplicate_explanation',duplicate_checked_at=now(),updated_at=clock_timestamp()
 where id=c.id;
 update public.finance_notification_events set date_provenance=p_parsed->>'date_provenance' where id=e.id;
 result:=finance_private.auto_confirm_notification(p_user_id,c.id);
 if result->>'confirmed'<>'true' then
  select * into c from public.finance_candidate_transactions where id=c.id and user_id=p_user_id;
  result:=result||jsonb_build_object('candidate',to_jsonb(c)||jsonb_build_object('intake',
   (select to_jsonb(i)||jsonb_build_object('notification',jsonb_build_object(
    'title',e.title,'body',e.body,'subtext',e.subtext,'source_package',e.source_package,'posted_at',e.posted_at,
    'date_provenance',p_parsed->>'date_provenance'))
    from public.finance_intake_items i where i.id=c.intake_item_id and i.user_id=p_user_id)));
 end if;
 return result;
exception when lock_not_available then
 raise exception using errcode='40001',message='Finance data changed concurrently. Retry the action.';
end $$;
revoke all on function public.finance_retry_notification_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_retry_notification_v1(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
