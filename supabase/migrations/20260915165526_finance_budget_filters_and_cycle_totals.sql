-- Release 15: shared selections and cycle-only history.
begin;
set local lock_timeout = '10s';
select pg_advisory_xact_lock(hashtextextended('idea-dump:finance-budget-closure',0));
lock table public.finance_budgets,public.finance_budget_sources,public.finance_budget_categories,
 public.finance_budget_cycles,public.finance_budget_cycle_breakdowns in access exclusive mode;

create temporary table budget_filters_before on commit drop as
 select budget_id,user_id,'source'::text kind,source_id,null::uuid category_id,original_id,label from public.finance_budget_sources
 union all
 select budget_id,user_id,'category',null::uuid,category_id,original_id,label from public.finance_budget_categories;
create temporary table budget_cycles_before on commit drop as select id,to_jsonb(c) original_row from public.finance_budget_cycles c;
create temporary table budget_settings_before on commit drop as
 select id,public.finance_budget_configuration(user_id,id) configuration from public.finance_budgets;

create table public.finance_budget_filters (
 budget_id uuid not null, user_id uuid not null, kind text not null,
 source_id uuid, category_id uuid, original_id uuid not null, label text not null,
 primary key(budget_id,kind,original_id),
 foreign key(budget_id,user_id) references public.finance_budgets(id,user_id) on delete cascade,
 foreign key(source_id,user_id) references public.dim_finance_sources(id,user_id) on delete set null (source_id),
 foreign key(category_id,user_id) references public.dim_finance_categories(id,user_id) on delete set null (category_id),
 -- Deleted archived selections retain their kind, original identity and label for explicit repair.
 check((kind='source' and category_id is null and (source_id is null or source_id=original_id))
    or (kind='category' and source_id is null and (category_id is null or category_id=original_id)))
);
create index finance_budget_filters_owner_idx on public.finance_budget_filters(budget_id,user_id);
create index finance_budget_filters_source_idx on public.finance_budget_filters(source_id,user_id);
create index finance_budget_filters_category_idx on public.finance_budget_filters(category_id,user_id);
insert into public.finance_budget_filters select * from budget_filters_before;

create or replace function public.finance_budget_matching(p_user_id uuid,p_budget_id uuid,p_start date,p_end date)
returns setof public.finance_transactions language sql stable security invoker set search_path = '' as $$
  with filters as (
    select v.*,
      exists(select 1 from public.finance_budget_filters s where s.budget_id=v.id and s.user_id=p_user_id and s.kind='source') has_sources,
      (v.include_uncategorised or exists(select 1 from public.finance_budget_filters c where c.budget_id=v.id and c.user_id=p_user_id and c.kind='category')) has_categories
    from public.finance_budgets v where v.id=p_budget_id and v.user_id=p_user_id
  )
  select t.* from public.finance_transactions t cross join filters f
  cross join lateral (select
    exists(select 1 from public.finance_budget_filters s where s.budget_id=f.id and s.user_id=p_user_id and s.source_id=t.source_id) source_match,
    ((t.category_id is null and f.include_uncategorised) or exists(select 1 from public.finance_budget_filters c where c.budget_id=f.id and c.user_id=p_user_id and c.category_id=t.category_id)) category_match
  ) m
  where t.user_id=p_user_id and t.status='confirmed' and t.transaction_date>=p_start and t.transaction_date<p_end
    and case when not f.has_sources and not f.has_categories then true
      when not f.has_sources then m.category_match when not f.has_categories then m.source_match
      when f.filter_logic='and' then m.source_match and m.category_match else m.source_match or m.category_match end;
$$;

create or replace function public.finance_budget_aggregate(p_user_id uuid,p_budget_id uuid,p_start date,p_end date) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
   'expense',round(coalesce(sum(amount) filter(where direction='expense'),0),2)::text,
   'income',round(coalesce(sum(amount) filter(where direction='income'),0),2)::text)
 from public.finance_budget_matching(p_user_id,p_budget_id,p_start,p_end);
$$;

create or replace function public.finance_budget_configuration(p_user_id uuid,p_budget_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v public.finance_budgets; sources jsonb; categories jsonb;
begin
 select * into v from public.finance_budgets where id=p_budget_id and user_id=p_user_id;
 if not found then raise exception using errcode='P0002',message='Budget not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.source_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into sources from public.finance_budget_filters s left join public.dim_finance_sources d on d.id=s.source_id and d.user_id=p_user_id where s.budget_id=v.id and s.user_id=p_user_id and s.kind='source';
  select coalesce(jsonb_agg(jsonb_build_object('id',s.category_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into categories from public.finance_budget_filters s left join public.dim_finance_categories d on d.id=s.category_id and d.user_id=p_user_id where s.budget_id=v.id and s.user_id=p_user_id and s.kind='category';
 return jsonb_build_object('name',v.name,'amount',v.amount::text,'cycle_type',v.cycle_type,'start_date',v.start_date,
      'anchor_day',v.anchor_day,'custom_days',v.custom_days,'time_zone',v.time_zone,
      'filter_logic',v.filter_logic,'include_uncategorised',v.include_uncategorised,'sources',sources,'categories',categories,
      'source_ids',coalesce((select jsonb_agg(x.source_id order by x.source_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.source_id is not null),'[]'::jsonb),
      'category_ids',coalesce((select jsonb_agg(x.category_id order by x.category_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.category_id is not null),'[]'::jsonb));
end;
$$;

create or replace function public.finance_budget_close(p_user_id uuid,p_cycle_id uuid,p_end date,p_reason text,p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path = '' as $$
declare c public.finance_budget_cycles; v public.finance_budgets; aggregate jsonb; metrics jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  select * into c from public.finance_budget_cycles where id=p_cycle_id and user_id=p_user_id for update;
  if not found or c.frozen_at is not null then return; end if;
  if p_end<=c.start_date then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id; return; end if;
  if p_end>c.end_date or p_reason not in ('completed','schedule','archived') then raise exception using errcode='22023',message='Invalid cycle closure'; end if;
  select * into strict v from public.finance_budgets where id=c.budget_id and user_id=p_user_id;
  aggregate:=public.finance_budget_aggregate(p_user_id,v.id,c.start_date,p_end);
  metrics:=public.finance_budget_metrics(v.amount,(aggregate->>'expense')::numeric,(aggregate->>'income')::numeric,c.start_date,p_end,p_end);
  update public.finance_budget_cycles set end_date=p_end,state=case when p_reason='completed' then 'completed' else 'partial' end,
    close_reason=p_reason,frozen_at=p_now,configuration_snapshot=public.finance_budget_configuration(p_user_id,c.budget_id),expense=(metrics->>'expense')::numeric,income=(metrics->>'income')::numeric,
    net_spending=(metrics->>'net_spending')::numeric,used_amount=(metrics->>'used_amount')::numeric,
    remaining=(metrics->>'remaining')::numeric,over_amount=(metrics->>'over_amount')::numeric,
    usage_percentage=(metrics->>'usage_percentage')::numeric,pace_percentage=(metrics->>'pace_percentage')::numeric,status=metrics->>'status'
    where id=c.id and user_id=p_user_id;
end;
$$;

create or replace function public.finance_budget_mutate(p_user_id uuid,p_action text,p_budget_id uuid default null,p_revision integer default null,
  p_request_id uuid default null,p_configuration jsonb default null,p_now timestamptz default now()) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; previous public.finance_budgets; c public.finance_budget_cycles;
  today date; earliest_start date; new_start date; name_value text; amount_value numeric; type_value text; days_value integer; anchor_value integer;
  zone_value text; source_ids uuid[]; category_ids uuid[]; schedule_changed boolean:=false; expected integer; actual integer;
begin
  if p_user_id is null or p_action is null or p_action not in ('create','update','archive','restore') then
    raise exception using errcode='22023',message='Invalid budget action';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  if p_action='create' then
    if p_request_id is null then raise exception using errcode='22023',message='request_id'; end if;
    select * into b from public.finance_budgets where user_id=p_user_id and create_request_id=p_request_id;
    if found then
      if b.create_fingerprint is distinct from md5(p_configuration::text) then raise exception using errcode='23505',message='request_id'; end if;
      return b.id;
    end if;
  else
    select * into b from public.finance_budgets where id=p_budget_id and user_id=p_user_id for update;
    if not found then raise exception using errcode='P0002',message='Budget not found'; end if;
    if p_revision is distinct from b.revision then raise exception using errcode='40001',message='revision'; end if;
    if (p_action='restore') <> (b.archived_at is not null) then raise exception using errcode='23514',message='Budget lifecycle conflict'; end if;
    perform public.finance_budget_reconcile(p_user_id,b.id,p_now);
    select * into strict previous from public.finance_budgets where id=b.id and user_id=p_user_id;
    today:=(p_now at time zone previous.time_zone)::date;
    select * into c from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id and frozen_at is null;
    if p_action='archive' then
      if c.id is not null then
        if c.start_date>today then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id;
        else perform public.finance_budget_close(p_user_id,c.id,least(today+1,c.end_date),'archived',p_now); end if;
      end if;
      update public.finance_budgets set archived_at=p_now,revision=revision+1,updated_at=p_now where id=b.id and user_id=p_user_id;
      return b.id;
    end if;
  end if;

  if p_configuration is null or jsonb_typeof(p_configuration)<>'object' then raise exception using errcode='22023',message='Invalid configuration'; end if;
  name_value:=btrim(p_configuration->>'name');
  if name_value is null or char_length(name_value) not between 1 and 120 then raise exception using errcode='22023',message='name'; end if;
  if coalesce(p_configuration->>'amount','') !~ '^\d+(\.\d{1,2})?$' then raise exception using errcode='22023',message='amount'; end if;
  amount_value:=(p_configuration->>'amount')::numeric;
  if amount_value<=0 or amount_value>999999999999.99 then raise exception using errcode='22023',message='amount'; end if;
  type_value:=p_configuration->>'cycle_type';
  if type_value is null or type_value not in ('weekly','monthly','custom') then raise exception using errcode='22023',message='cycle_type'; end if;
  if type_value='custom' then
    if coalesce(p_configuration->>'custom_days','') !~ '^\d{1,3}$' then raise exception using errcode='22023',message='custom_days'; end if;
    days_value:=(p_configuration->>'custom_days')::integer;
    if days_value not between 1 and 365 then raise exception using errcode='22023',message='custom_days'; end if;
  end if;
  if coalesce(p_configuration->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='start_date'; end if;
  begin new_start:=(p_configuration->>'start_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='22023',message='start_date'; end;
  if new_start not between date '1900-01-01' and date '9998-12-31' then raise exception using errcode='22023',message='start_date'; end if;
  if type_value='monthly' then
    if coalesce(p_configuration->>'anchor_day','') !~ '^\d{1,2}$' then raise exception using errcode='22023',message='anchor_day'; end if;
    anchor_value:=(p_configuration->>'anchor_day')::integer;
    if anchor_value not between 1 and 31 then raise exception using errcode='22023',message='anchor_day'; end if;
  end if;
  zone_value:=p_configuration->>'time_zone';
  if zone_value is null or not exists(select 1 from pg_timezone_names where name=zone_value) then raise exception using errcode='22023',message='time_zone'; end if;
  if p_action<>'create' and zone_value is distinct from previous.time_zone then raise exception using errcode='22023',message='time_zone'; end if;
  today:=(p_now at time zone zone_value)::date;
  if p_action in ('create','restore') or c.state='scheduled' then
    -- New and scheduled budgets may include the current calendar period.
    -- Restoration keeps its existing today-or-later rule and frozen history.
    earliest_start:=case when p_action='restore' then today
      when type_value='monthly' then date_trunc('month',today::timestamp)::date
      when type_value='weekly' then date_trunc('week',today::timestamp)::date
      else today end;
    if new_start<earliest_start then raise exception using errcode='22023',message='start_date'; end if;
    if type_value='monthly' then anchor_value:=extract(day from new_start)::integer; end if;
  else
    schedule_changed:=type_value is distinct from previous.cycle_type or days_value is distinct from previous.custom_days
      or anchor_value is distinct from previous.anchor_day or new_start is distinct from previous.start_date;
    if schedule_changed then new_start:=today; end if;
  end if;
  if p_configuration->>'filter_logic' is null or p_configuration->>'filter_logic' not in ('and','or') then raise exception using errcode='22023',message='filter_logic'; end if;
  if jsonb_typeof(p_configuration->'include_uncategorised') is distinct from 'boolean' then raise exception using errcode='22023',message='include_uncategorised'; end if;
  if jsonb_typeof(p_configuration->'source_ids') is distinct from 'array' then raise exception using errcode='22023',message='source_ids'; end if;
  if jsonb_typeof(p_configuration->'category_ids') is distinct from 'array' then raise exception using errcode='22023',message='category_ids'; end if;
  begin select coalesce(array_agg(distinct x::uuid),array[]::uuid[]) into source_ids from jsonb_array_elements_text(p_configuration->'source_ids') x;
  exception when invalid_text_representation then raise exception using errcode='22023',message='source_ids'; end;
  begin select coalesce(array_agg(distinct x::uuid),array[]::uuid[]) into category_ids from jsonb_array_elements_text(p_configuration->'category_ids') x;
  exception when invalid_text_representation then raise exception using errcode='22023',message='category_ids'; end;
  -- Reference locks serialize creation/restoration with deletion and archival.
  perform 1 from public.dim_finance_sources where user_id=p_user_id and id=any(source_ids) order by id for share;
  expected:=cardinality(source_ids);
  select count(*) into actual from public.dim_finance_sources s where s.user_id=p_user_id and s.id=any(source_ids)
    and (not s.is_archived or exists(select 1 from public.finance_budget_filters x where x.budget_id=previous.id and x.user_id=p_user_id and x.source_id=s.id));
  if expected<>actual then raise exception using errcode='22023',message='source_ids'; end if;
  perform 1 from public.dim_finance_categories where user_id=p_user_id and id=any(category_ids) order by id for share;
  expected:=cardinality(category_ids);
  select count(*) into actual from public.dim_finance_categories s where s.user_id=p_user_id and s.id=any(category_ids)
    and (not s.is_archived or exists(select 1 from public.finance_budget_filters x where x.budget_id=previous.id and x.user_id=p_user_id and x.category_id=s.id));
  if expected<>actual then raise exception using errcode='22023',message='category_ids'; end if;


  -- Freeze the old schedule with its old filters before changing current settings.
  if c.id is not null then
    if c.state='scheduled' then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id;
    elsif schedule_changed then perform public.finance_budget_close(p_user_id,c.id,today,'schedule',p_now); end if;
  end if;
  if p_action='create' then
    insert into public.finance_budgets(user_id,name,create_request_id,create_fingerprint,created_at,updated_at,
      amount,cycle_type,start_date,anchor_day,custom_days,time_zone,filter_logic,include_uncategorised)
    values(p_user_id,name_value,p_request_id,md5(p_configuration::text),p_now,p_now,
      amount_value,type_value,new_start,anchor_value,days_value,zone_value,p_configuration->>'filter_logic',(p_configuration->>'include_uncategorised')::boolean) returning * into b;
  else
    update public.finance_budgets set name=name_value,amount=amount_value,cycle_type=type_value,start_date=new_start,
      anchor_day=anchor_value,custom_days=days_value,time_zone=zone_value,filter_logic=p_configuration->>'filter_logic',
      include_uncategorised=(p_configuration->>'include_uncategorised')::boolean,archived_at=null,revision=revision+1,updated_at=p_now
    where id=b.id and user_id=p_user_id;
  end if;
  delete from public.finance_budget_filters where budget_id=b.id and user_id=p_user_id;
  insert into public.finance_budget_filters(budget_id,user_id,kind,source_id,original_id,label)
    select b.id,p_user_id,'source',s.id,s.id,s.name from public.dim_finance_sources s where s.user_id=p_user_id and s.id=any(source_ids);
  insert into public.finance_budget_filters(budget_id,user_id,kind,category_id,original_id,label)
    select b.id,p_user_id,'category',s.id,s.id,s.name from public.dim_finance_categories s where s.user_id=p_user_id and s.id=any(category_ids);
  if p_action in ('create','restore') or c.state='scheduled' or schedule_changed then
    insert into public.finance_budget_cycles(budget_id,user_id,start_date,end_date,state)
      values(b.id,p_user_id,new_start,public.finance_budget_next_boundary(new_start,type_value,days_value,anchor_value),case when new_start>today then 'scheduled' else 'active' end);
  end if;
  return b.id;
end;
$$;

create or replace function public.finance_budget_cycle_json(p_user_id uuid,p_cycle_id uuid,p_today date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare c public.finance_budget_cycles; v public.finance_budgets; aggregate jsonb; metrics jsonb; configuration jsonb;
begin
  select * into c from public.finance_budget_cycles where id=p_cycle_id and user_id=p_user_id;
  if not found then return null; end if;
  if c.frozen_at is null then
    select * into strict v from public.finance_budgets where id=c.budget_id and user_id=p_user_id;
    configuration:=public.finance_budget_configuration(p_user_id,c.budget_id);
    if c.start_date>p_today then aggregate:='{"expense":"0.00","income":"0.00"}'::jsonb;
    else aggregate:=public.finance_budget_aggregate(p_user_id,v.id,c.start_date,c.end_date); end if;
    metrics:=public.finance_budget_metrics(v.amount,(aggregate->>'expense')::numeric,(aggregate->>'income')::numeric,c.start_date,c.end_date,p_today);
  else
    configuration:=c.configuration_snapshot;
    metrics:=jsonb_build_object('amount',configuration->>'amount','expense',round(c.expense,2)::text,'income',round(c.income,2)::text,
      'net_spending',round(c.net_spending,2)::text,'used_amount',round(c.used_amount,2)::text,'remaining',round(c.remaining,2)::text,
      'over_amount',round(c.over_amount,2)::text,'usage_percentage',c.usage_percentage::text,'pace_percentage',c.pace_percentage::text,'status',c.status);
  end if;
  return jsonb_build_object('id',c.id,'start_date',c.start_date,'end_date',c.end_date,'state',c.state,'close_reason',c.close_reason,
    'frozen_at',c.frozen_at,'configuration',configuration,'metrics',metrics,
    -- Empty compatibility field for previously deployed release 15 clients.
    'breakdowns','[]'::jsonb);
end;
$$;

create or replace function public.finance_budget_guard_reference_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  if tg_table_name='dim_finance_sources' then
    if exists(select 1 from public.finance_budget_filters s join public.finance_budgets b on b.id=s.budget_id and b.user_id=s.user_id
      where s.source_id=old.id and s.user_id=old.user_id and b.archived_at is null) then
      raise exception using errcode='23503',message='Source is selected by a budget';
    end if;
  else
    if exists(select 1 from public.finance_budget_filters s join public.finance_budgets b on b.id=s.budget_id and b.user_id=s.user_id
      where s.category_id=old.id and s.user_id=old.user_id and b.archived_at is null) then
      raise exception using errcode='23503',message='Category is selected by a budget';
    end if;
  end if;
  return old;
end;
$$;

do $verify$
begin
 if exists((table budget_filters_before except table public.finance_budget_filters)
    union all (table public.finance_budget_filters except table budget_filters_before)) then
   raise exception 'Budget filter copy differs'; end if;
 if exists((select original_row from budget_cycles_before except select to_jsonb(c) from public.finance_budget_cycles c)
    union all (select to_jsonb(c) from public.finance_budget_cycles c except select original_row from budget_cycles_before)) then
   raise exception 'Budget cycles changed'; end if;
 if exists(select 1 from budget_settings_before old join public.finance_budgets b on b.id=old.id
   where public.finance_budget_configuration(b.user_id,b.id) is distinct from old.configuration) then
   raise exception 'Budget settings changed'; end if;
end;
$verify$;

-- No CASCADE: unexpected dependencies abort instead of being removed.
drop table public.finance_budget_sources;
drop table public.finance_budget_categories;
drop table public.finance_budget_cycle_breakdowns;
drop function public.finance_budget_breakdown_open();

alter table public.finance_budget_filters enable row level security;
create policy server_only_deny on public.finance_budget_filters as restrictive for all to anon,authenticated using (false) with check (false);
revoke all on public.finance_budget_filters from public,anon,authenticated;
grant select,insert,update,delete on public.finance_budget_filters to service_role;
-- Replaced functions retain their existing server-only execution grants.
notify pgrst, 'reload schema';
commit;
