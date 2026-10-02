-- Historical dashboard cards use frozen cycles, never today's configuration or ledger.
create function public.finance_budget_dashboard(p_user_id uuid, p_month text, p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare month_start date; next_month date; current_month text; b record; result jsonb;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or left(p_month,4) = '0000' or p_now is null then
    raise exception using errcode='22023',message='Invalid month';
  end if;
  month_start := (p_month || '-01')::date;
  next_month := (month_start + interval '1 month')::date;
  -- The reporting month follows the Finance dashboard's Kuala Lumpur calendar.
  current_month := to_char(p_now at time zone 'Asia/Kuala_Lumpur','YYYY-MM');
  if p_month > current_month then return '[]'::jsonb; end if;
  if p_month = current_month then
    select coalesce(jsonb_agg(jsonb_build_object('budget_id',item->>'id','name',item->>'name',
      'cycle',item->'current_cycle') order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public.finance_budget_list(p_user_id,'active',1,3,true,p_now)->'data') with ordinality as x(item,ordinal);
    return result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:' || p_user_id::text,0));
  for b in select id from public.finance_budgets where user_id=p_user_id and archived_at is null order by id loop
    -- Always reconcile at the actual read time, never at the requested historical month.
    perform public.finance_budget_reconcile(p_user_id,b.id,p_now);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('budget_id',c.budget_id,'name',c.configuration_snapshot->>'name',
    'cycle',public.finance_budget_cycle_json(p_user_id,c.id,(p_now at time zone 'Asia/Kuala_Lumpur')::date))
    order by c.end_date desc,c.start_date desc,c.budget_id,c.id),'[]'::jsonb) into result
  from public.finance_budget_cycles c
  where c.user_id=p_user_id and c.frozen_at is not null
    -- End dates are exclusive. Assign a whole cycle to the month of its last included day.
    and c.end_date>month_start and c.end_date<=next_month;
  return result;
end;
$$;

revoke all on function public.finance_budget_dashboard(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.finance_budget_dashboard(uuid,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
