-- Link reviewed evidence to one ledger row, applying only explicitly selected values.
create function public.finance_link_candidate_v1(
  p_user_id uuid,
  p_candidate_id uuid,
  p_matched_transaction_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.finance_candidate_transactions;
  existing public.finance_transactions;
  revised public.finance_transactions;
  before_values jsonb;
  applied jsonb := '{}'::jsonb;
  changes jsonb := '{}'::jsonb;
  item record;
  payee_name text;
  result jsonb;
begin
  if p_user_id is null or p_candidate_id is null or p_matched_transaction_id is null
     or p_expected_updated_at is null or p_changes is null
     or jsonb_typeof(p_changes) <> 'object' then
    raise exception using errcode='22023', message='Invalid Finance evidence link';
  end if;
  for item in select * from jsonb_each(p_changes) loop
    if item.key not in ('amount','direction','source_id','category_id','transaction_date',
                        'merchant','payee_name','reference_number','notes')
       or (item.key='amount' and jsonb_typeof(item.value)<>'number')
       or (item.key<>'amount' and (jsonb_typeof(item.value)<>'string' or btrim(item.value #>> '{}')='')) then
      raise exception using errcode='22023', message='Invalid linked field';
    end if;
    changes := changes || jsonb_build_object(item.key, case
      when item.key='amount' then item.value
      when item.key='reference_number' then to_jsonb(public.finance_normalize_reference_number(item.value #>> '{}'))
      else to_jsonb(btrim(item.value #>> '{}')) end);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:' || p_user_id::text,0));
  select * into candidate from public.finance_candidate_transactions
    where id=p_candidate_id and user_id=p_user_id for update nowait;
  if not found then raise exception using errcode='P0002',message='Finance review item not found'; end if;
  perform 1 from public.finance_intake_items
    where id=candidate.intake_item_id and user_id=p_user_id for update nowait;
  if not found then raise exception using errcode='P0002',message='Finance intake not found'; end if;
  select * into existing from public.finance_transactions
    where id=p_matched_transaction_id and user_id=p_user_id and status='confirmed' for update nowait;
  if not found then raise exception using errcode='P0002',message='Finance transaction not found'; end if;
  if candidate.status='duplicate' and candidate.payload->>'duplicate_transaction_id'=p_matched_transaction_id::text then
    select detail->'result' into result from public.finance_processing_events
      where user_id=p_user_id and intake_item_id=candidate.intake_item_id and event_type='duplicate_linked'
        and detail->>'candidate_id'=p_candidate_id::text
        and detail->>'matched_transaction_id'=p_matched_transaction_id::text
      order by created_at desc limit 1;
    if result is not null then return result; end if;
  end if;
  if candidate.status<>'pending' then
    raise exception using errcode='23514',message='Only pending review items can be linked';
  end if;
  if existing.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='Finance transaction changed during review';
  end if;
  select name into payee_name from public.dim_finance_payees where id=existing.payee_id and user_id=p_user_id;
  before_values := to_jsonb(existing) || jsonb_build_object('payee_name',payee_name);
  if changes ? 'amount' and ((changes->>'amount')::numeric<=0
     or (changes->>'amount')::numeric>999999999999.99
     or (changes->>'amount')::numeric<>round((changes->>'amount')::numeric,2)) then
    raise exception using errcode='22023',message='Invalid Finance amount';
  end if;
  revised := jsonb_populate_record(existing,changes-'payee_name');
  if revised.direction is null or revised.direction not in ('expense','income')
     or revised.amount is null or revised.amount<=0 or revised.amount>999999999999.99
     or revised.amount<>round(revised.amount,2)
     or revised.transaction_date is null or revised.currency<>'MYR'
     or char_length(revised.merchant)>500 or char_length(revised.notes)>2500
     or char_length(revised.reference_number)>200 then
    raise exception using errcode='22023',message='Invalid linked Finance transaction values';
  end if;
  if changes ? 'transaction_date' and changes->>'transaction_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='Invalid transaction date';
  end if;
  for item in select * from jsonb_each(changes) loop
    if coalesce(before_values->item.key,'null'::jsonb) is distinct from item.value then
      applied := applied || jsonb_build_object(item.key,jsonb_build_object('before',before_values->item.key,'after',item.value));
    end if;
  end loop;
  if applied ? 'payee_name' then
    revised.payee_id := finance_private.finance_resolve_payee_v1(p_user_id,changes->>'payee_name');
    select name into payee_name from public.dim_finance_payees where id=revised.payee_id and user_id=p_user_id;
    if before_values->>'payee_name' is not distinct from payee_name then
      applied := applied-'payee_name';
    else
      applied := jsonb_set(applied,'{payee_name,after}',to_jsonb(payee_name));
    end if;
  end if;
  if applied <> '{}'::jsonb then
    -- Existing ownership and dimension triggers still govern this update.
    update public.finance_transactions set amount=revised.amount,direction=revised.direction,
      source_id=revised.source_id,category_id=revised.category_id,transaction_date=revised.transaction_date,
      merchant=revised.merchant,payee_id=revised.payee_id,reference_number=revised.reference_number,
      notes=revised.notes,updated_at=clock_timestamp()
      where id=existing.id and user_id=p_user_id;
  end if;
  perform public.finance_mark_candidate_duplicate(p_user_id,p_candidate_id,p_matched_transaction_id);
  result := jsonb_build_object('linked',true,'transaction_id',existing.id,'applied_fields',
    coalesce((select jsonb_agg(key order by key) from jsonb_each(applied)),'[]'::jsonb));
  -- Store reviewed structured values with their supplying intake, without feeding OCR learning.
  insert into public.finance_processing_events(user_id,intake_item_id,event_type,detail)
    values(p_user_id,candidate.intake_item_id,'duplicate_linked',jsonb_build_object(
      'candidate_id',candidate.id,'matched_transaction_id',existing.id,'changes',applied,'result',result));
  return result;
exception when lock_not_available then
  raise exception using errcode='40001',message='Finance data changed concurrently. Retry the action.';
end;
$$;
revoke all on function public.finance_link_candidate_v1(uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.finance_link_candidate_v1(uuid,uuid,uuid,timestamptz,jsonb) to service_role;
