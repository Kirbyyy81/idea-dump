begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('idea-dump:finance-budget-closure',0));
lock table public.finance_budgets,public.finance_budget_cycles,public.finance_budget_filters in access exclusive mode;
create temporary table frozen_budgets_before on commit drop as
 select id,to_jsonb(c) original_row from public.finance_budget_cycles c where frozen_at is not null;

alter table public.finance_budgets alter column start_date drop not null,
 drop constraint finance_budget_cycle_type_check, drop constraint finance_budget_start_check,
 add constraint finance_budget_cycle_type_check check(cycle_type in ('weekly','monthly','custom','one_time')),
 add constraint finance_budget_start_check check((cycle_type='one_time' and start_date is null)
   or (cycle_type<>'one_time' and start_date is not null and start_date between date '1900-01-01' and date '9998-12-31'));
alter table public.finance_budget_cycles alter column start_date drop not null,alter column end_date drop not null,
 drop constraint finance_budget_cycles_check,
 add constraint finance_budget_cycles_check check((start_date is null and end_date is null)
   or (start_date is not null and end_date is not null and end_date>start_date));
alter table public.finance_budget_filters add column tag_id uuid,
 add constraint finance_budget_filters_tag_owner_fkey foreign key(tag_id,user_id)
   references public.dim_finance_tags(id,user_id) on delete set null(tag_id),
 drop constraint finance_budget_filters_check,
 add constraint finance_budget_filters_check check(
 (kind='source' and category_id is null and tag_id is null and (source_id is null or source_id=original_id))
 or (kind='category' and source_id is null and tag_id is null and (category_id is null or category_id=original_id))
 or (kind='tag' and source_id is null and category_id is null and (tag_id is null or tag_id=original_id)));
create index finance_budget_filters_tag_owner on public.finance_budget_filters(tag_id,user_id);


create or replace function public.finance_budget_matching(p_user_id uuid,p_budget_id uuid,p_start date,p_end date)
returns setof public.finance_transactions language sql stable security invoker set search_path='' as $$
 with filters as (
  select b.*,
   exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='source') has_sources,
   (b.include_uncategorised or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='category')) has_categories,
   exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='tag') has_tags
  from public.finance_budgets b where b.user_id=p_user_id and b.id=p_budget_id
 )
 select t.* from public.finance_transactions t cross join filters f
 cross join lateral(select
  exists(select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.source_id=t.source_id) source_match,
  ((t.category_id is null and f.include_uncategorised) or exists(select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.category_id=t.category_id)) category_match,
  exists(select 1 from public.finance_budget_filters x join public.finance_transaction_tags tt on tt.user_id=x.user_id and tt.tag_id=x.tag_id
    where x.user_id=p_user_id and x.budget_id=f.id and x.kind='tag' and tt.transaction_id=t.id) tag_match
 ) m
 where t.user_id=p_user_id and t.status='confirmed'
  and (p_start is null or t.transaction_date>=p_start) and (p_end is null or t.transaction_date<p_end)
  and case when not f.has_sources and not f.has_categories and not f.has_tags then true
   when f.filter_logic='and' then (not f.has_sources or m.source_match) and (not f.has_categories or m.category_match) and (not f.has_tags or m.tag_match)
   else (f.has_sources and m.source_match) or (f.has_categories and m.category_match) or (f.has_tags and m.tag_match) end;
$$;

create or replace function public.finance_budget_configuration(p_user_id uuid,p_budget_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v public.finance_budgets; sources jsonb; categories jsonb; tags jsonb;
begin
 select * into v from public.finance_budgets where id=p_budget_id and user_id=p_user_id;
 if not found then raise exception using errcode='P0002',message='Budget not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.source_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into sources from public.finance_budget_filters s left join public.dim_finance_sources d on d.id=s.source_id and d.user_id=p_user_id where s.budget_id=v.id and s.user_id=p_user_id and s.kind='source';
  select coalesce(jsonb_agg(jsonb_build_object('id',s.category_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into categories from public.finance_budget_filters s left join public.dim_finance_categories d on d.id=s.category_id and d.user_id=p_user_id where s.budget_id=v.id and s.user_id=p_user_id and s.kind='category';
 select coalesce(jsonb_agg(jsonb_build_object('id',s.tag_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
 into tags from public.finance_budget_filters s left join public.dim_finance_tags d on d.id=s.tag_id and d.user_id=p_user_id
 where s.budget_id=v.id and s.user_id=p_user_id and s.kind='tag';
 return jsonb_build_object('tags',tags,'tag_ids',coalesce((select jsonb_agg(x.tag_id order by x.tag_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.kind='tag' and x.tag_id is not null),'[]'::jsonb),'name',v.name,'amount',v.amount::text,'cycle_type',v.cycle_type,'start_date',v.start_date,
      'anchor_day',v.anchor_day,'custom_days',v.custom_days,'time_zone',v.time_zone,
      'filter_logic',v.filter_logic,'include_uncategorised',v.include_uncategorised,'sources',sources,'categories',categories,
      'source_ids',coalesce((select jsonb_agg(x.source_id order by x.source_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.source_id is not null),'[]'::jsonb),
      'category_ids',coalesce((select jsonb_agg(x.category_id order by x.category_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.category_id is not null),'[]'::jsonb));
end;
$$;

create or replace function public.finance_budget_next_boundary(p_start date,p_type text,p_days integer,p_anchor integer) returns date
language plpgsql immutable security invoker set search_path = '' as $$
declare boundary date; month_start date;
begin
  if p_type='one_time' then return null; end if;
  if p_type='weekly' then return p_start+7; end if;
  if p_type='custom' and p_days between 1 and 365 then return p_start+p_days; end if;
  if p_type is distinct from 'monthly' or p_anchor is null or p_anchor not between 1 and 31 then
    raise exception using errcode='22023',message='Invalid budget schedule';
  end if;
  month_start := date_trunc('month',p_start)::date;
  boundary := least(month_start+p_anchor-1,(month_start+interval '1 month')::date-1);
  if boundary <= p_start then
    month_start := (month_start+interval '1 month')::date;
    boundary := least(month_start+p_anchor-1,(month_start+interval '1 month')::date-1);
  end if;
  return boundary;
end;
$$;

create or replace function public.finance_budget_metrics(p_amount numeric,p_expense numeric,p_income numeric,p_start date,p_end date,p_today date)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare net numeric:=p_expense-p_income; used numeric:=greatest(net,0); days integer:=p_end-p_start;
  elapsed integer:=greatest(0,least(days,p_today-p_start)); budget_status text;
begin
  if p_start is null and p_end is null then days:=null; elapsed:=0; end if;
  if p_amount<=0 or days<=0 or (p_start is null)<>(p_end is null) then raise exception using errcode='22023',message='Invalid budget calculation'; end if;
  budget_status:=case when p_today<p_start then 'scheduled' when used>p_amount then 'over_budget'
    when used=p_amount then 'limit_reached' when used*5>=p_amount*4 or used*days>p_amount*elapsed then 'needs_attention' else 'on_track' end;
  return jsonb_build_object('amount',round(p_amount,2)::text,'expense',round(p_expense,2)::text,'income',round(p_income,2)::text,
    'net_spending',round(net,2)::text,'used_amount',round(used,2)::text,'remaining',round(greatest(p_amount-used,0),2)::text,
    'over_amount',round(greatest(used-p_amount,0),2)::text,'usage_percentage',round(used/p_amount*100,6)::text,
    'pace_percentage',case when days is null then '0.000000' else round(elapsed::numeric/days*100,6)::text end,'status',budget_status);
end;
$$;

create or replace function public.finance_budget_close(p_user_id uuid,p_cycle_id uuid,p_end date,p_reason text,p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path = '' as $$
declare c public.finance_budget_cycles; v public.finance_budgets; aggregate jsonb; metrics jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  select * into c from public.finance_budget_cycles where id=p_cycle_id and user_id=p_user_id for update;
  if not found or c.frozen_at is not null then return; end if;
  if c.start_date is null then
    if p_reason not in ('archived','schedule') then raise exception 'Invalid one-time closure' using errcode='22023'; end if;
    p_end:=null;
  elsif p_end is null then raise exception 'Invalid cycle closure' using errcode='22023'; end if;
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

create or replace function public.finance_budget_reconcile(p_user_id uuid,p_budget_id uuid,p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; v public.finance_budgets; c public.finance_budget_cycles; today date; next_start date;
begin
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  select * into b from public.finance_budgets where id=p_budget_id and user_id=p_user_id for update;
  if not found or b.archived_at is not null then return; end if;
  select * into strict v from public.finance_budgets where id=b.id and user_id=p_user_id;
  if v.cycle_type='one_time' then
    if not exists(select 1 from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id and frozen_at is null) then
      insert into public.finance_budget_cycles(budget_id,user_id,start_date,end_date,state) values(b.id,p_user_id,null,null,'active');
    end if;
    return;
  end if;
  today:=(p_now at time zone v.time_zone)::date;
  loop
    select * into c from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id and frozen_at is null for update;
    if not found then
      select coalesce(max(end_date),v.start_date) into next_start from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id;
      next_start:=greatest(next_start,v.start_date);
      insert into public.finance_budget_cycles(budget_id,user_id,start_date,end_date,state)
        values(b.id,p_user_id,next_start,public.finance_budget_next_boundary(next_start,v.cycle_type,v.custom_days,v.anchor_day),
          case when next_start>today then 'scheduled' else 'active' end) returning * into c;
    end if;
    if c.end_date>today then
      if c.state='scheduled' and c.start_date<=today then update public.finance_budget_cycles set state='active' where id=c.id and user_id=p_user_id; end if;
      return;
    end if;
    perform public.finance_budget_close(p_user_id,c.id,c.end_date,'completed',p_now);
  end loop;
end;
$$;

create or replace function public.finance_budget_mutate(p_user_id uuid,p_action text,p_budget_id uuid default null,p_revision integer default null,
  p_request_id uuid default null,p_configuration jsonb default null,p_now timestamptz default now()) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; previous public.finance_budgets; c public.finance_budget_cycles;
  today date; earliest_start date; new_start date; name_value text; amount_value numeric; type_value text; days_value integer; anchor_value integer;
  zone_value text; source_ids uuid[]; category_ids uuid[]; tag_ids uuid[]; schedule_changed boolean:=false; expected integer; actual integer;
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
  if type_value is null or type_value not in ('weekly','monthly','custom','one_time') then raise exception using errcode='22023',message='cycle_type'; end if;
  if type_value='custom' then
    if coalesce(p_configuration->>'custom_days','') !~ '^\d{1,3}$' then raise exception using errcode='22023',message='custom_days'; end if;
    days_value:=(p_configuration->>'custom_days')::integer;
    if days_value not between 1 and 365 then raise exception using errcode='22023',message='custom_days'; end if;
  end if;
  if type_value='one_time' then
    if p_configuration->>'start_date' is not null or p_configuration->>'custom_days' is not null or p_configuration->>'anchor_day' is not null then raise exception using errcode='22023',message='start_date'; end if;
    new_start:=null;
  else
  if coalesce(p_configuration->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='start_date'; end if;
  begin new_start:=(p_configuration->>'start_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='22023',message='start_date'; end;
  if new_start not between date '1900-01-01' and date '9998-12-31' then raise exception using errcode='22023',message='start_date'; end if;
  end if;
  if type_value='monthly' then
    if coalesce(p_configuration->>'anchor_day','') !~ '^\d{1,2}$' then raise exception using errcode='22023',message='anchor_day'; end if;
    anchor_value:=(p_configuration->>'anchor_day')::integer;
    if anchor_value not between 1 and 31 then raise exception using errcode='22023',message='anchor_day'; end if;
  end if;
  zone_value:=p_configuration->>'time_zone';
  if zone_value is null or not exists(select 1 from pg_timezone_names where name=zone_value) then raise exception using errcode='22023',message='time_zone'; end if;
  if p_action<>'create' and zone_value is distinct from previous.time_zone then raise exception using errcode='22023',message='time_zone'; end if;
  today:=(p_now at time zone zone_value)::date;
  if type_value='one_time' then
    schedule_changed:=p_action='update' and previous.cycle_type is distinct from 'one_time';
  elsif p_action in ('create','restore') or c.state='scheduled' then
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
  if p_configuration ? 'tag_ids' and jsonb_typeof(p_configuration->'tag_ids') is distinct from 'array' then raise exception using errcode='22023',message='tag_ids'; end if;
  begin
    if p_configuration ? 'tag_ids' then
      if jsonb_array_length(p_configuration->'tag_ids')>50 or exists(select 1 from jsonb_array_elements(p_configuration->'tag_ids') x where jsonb_typeof(x)<>'string') then raise exception using errcode='22023',message='tag_ids'; end if;
      select coalesce(array_agg(distinct x::uuid),array[]::uuid[]) into tag_ids from jsonb_array_elements_text(p_configuration->'tag_ids') x;
    else
      select coalesce(array_agg(original_id),array[]::uuid[]) into tag_ids from public.finance_budget_filters where budget_id=previous.id and user_id=p_user_id and kind='tag';
    end if;
  exception when invalid_text_representation then raise exception using errcode='22023',message='tag_ids'; end;
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


  perform 1 from public.dim_finance_tags where user_id=p_user_id and id=any(tag_ids) order by id for share;
  select count(*) into actual from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(tag_ids)
    and (not t.is_archived or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=previous.id and f.tag_id=t.id));
  if cardinality(tag_ids)<>actual then raise exception using errcode='22023',message='tag_ids'; end if;

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
  insert into public.finance_budget_filters(budget_id,user_id,kind,tag_id,original_id,label)
    select b.id,p_user_id,'tag',t.id,t.id,t.name from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(tag_ids);
  if p_action in ('create','restore') or c.state='scheduled' or schedule_changed then
    insert into public.finance_budget_cycles(budget_id,user_id,start_date,end_date,state)
      values(b.id,p_user_id,new_start,public.finance_budget_next_boundary(new_start,type_value,days_value,anchor_value),case when new_start>today then 'scheduled' else 'active' end);
  end if;
  return b.id;
end;
$$;

create or replace function public.finance_budget_list(p_user_id uuid,p_state text default 'active',p_page integer default 1,p_page_size integer default 20,
  p_dashboard boolean default false,p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare b record; result jsonb;
begin
  if p_state is null or p_state not in ('active','scheduled','archived','all') or p_page is null or p_page<1 or p_page>1000000
    or p_page_size is null or p_page_size not between 1 and 100 then raise exception using errcode='22023',message='Invalid pagination'; end if;
  for b in select id from public.finance_budgets where user_id=p_user_id and archived_at is null order by id loop
    perform public.finance_budget_reconcile(p_user_id,b.id,p_now);
  end loop;
  with summaries as materialized (
    select public.finance_budget_summary(p_user_id,x.id,p_now) item,x.created_at
    from public.finance_budgets x
    where x.user_id=p_user_id and case when p_dashboard then x.archived_at is null and x.cycle_type<>'one_time' and x.start_date<=(p_now at time zone x.time_zone)::date
      when p_state='all' then true when p_state='archived' then x.archived_at is not null
      when p_state='scheduled' then x.archived_at is null and x.start_date>(p_now at time zone x.time_zone)::date
      else x.archived_at is null and (x.cycle_type='one_time' or x.start_date<=(p_now at time zone x.time_zone)::date) end
  ), selected as (
    select item from summaries order by
      case when p_dashboard then case item->>'status' when 'over_budget' then 0 when 'limit_reached' then 1 when 'needs_attention' then 2 else 3 end else 0 end,
      -- 32 fractional places distinguish ratios whose minor-unit denominators are at most 14 digits.
      case when p_dashboard then round((item->'current_cycle'->'metrics'->>'used_amount')::numeric,32) / (item->'configuration'->>'amount')::numeric else 0 end desc,
      case when not p_dashboard then created_at end desc,item->>'id'
    limit case when p_dashboard then 3 else p_page_size end offset case when p_dashboard then 0 else (p_page-1)*p_page_size end
  ) select jsonb_build_object('data',coalesce((select jsonb_agg(item) from selected),'[]'::jsonb),'total',(select count(*) from summaries),
    'page',case when p_dashboard then 1 else p_page end,'page_size',case when p_dashboard then 3 else p_page_size end) into result;
  return result;
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
  elsif tg_table_name='dim_finance_tags' then
    if exists(select 1 from public.finance_budget_filters f join public.finance_budgets b on b.id=f.budget_id and b.user_id=f.user_id
      where f.tag_id=old.id and f.user_id=old.user_id and b.archived_at is null) then
      raise exception using errcode='23503',message='Tag is selected by a budget';
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

create trigger finance_budget_tag_delete before delete on public.dim_finance_tags for each row execute function public.finance_budget_guard_reference_delete();

-- Tag membership is mutable ledger evidence. Freeze due tagged cycles first.
-- This trusted-only trigger reads Auth to skip retention cascades; browser roles cannot execute it.
create function finance_private.reconcile_tag_budgets_before_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; b record;
begin
 owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if exists(select 1 from auth.users where id=owner_id) then
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||owner_id::text,0));
  for b in select x.id from public.finance_budgets x where x.user_id=owner_id and x.archived_at is null
   and exists(select 1 from public.finance_budget_filters f where f.budget_id=x.id and f.user_id=owner_id and f.kind='tag') order by x.id loop
   perform public.finance_budget_reconcile(owner_id,b.id);
  end loop;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function finance_private.reconcile_tag_budgets_before_write() from public,anon,authenticated;
grant execute on function finance_private.reconcile_tag_budgets_before_write() to service_role;
create trigger finance_budget_tag_membership_write before insert or update or delete on public.finance_transaction_tags
 for each row execute function finance_private.reconcile_tag_budgets_before_write();
create trigger finance_budget_tag_transaction_write before insert or update or delete on public.finance_transactions
 for each row execute function finance_private.reconcile_tag_budgets_before_write();


create or replace function public.finance_budget_dashboard(p_user_id uuid, p_month text, p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare month_start date; next_month date; current_month text; b record; result jsonb; ongoing jsonb;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or left(p_month,4) = '0000' or p_now is null then
    raise exception using errcode='22023',message='Invalid month';
  end if;
  month_start := (p_month || '-01')::date;
  next_month := (month_start + interval '1 month')::date;
  -- The reporting month follows the Finance dashboard's Kuala Lumpur calendar.
  current_month := to_char(p_now at time zone 'Asia/Kuala_Lumpur','YYYY-MM');
  result:='[]'::jsonb;
  if p_month = current_month then
    select coalesce(jsonb_agg(jsonb_build_object('budget_id',item->>'id','name',item->>'name',
      'cycle',item->'current_cycle') order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public.finance_budget_list(p_user_id,'active',1,3,true,p_now)->'data') with ordinality as x(item,ordinal);
  elsif p_month < current_month then

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
  end if;
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  for b in select id from public.finance_budgets where user_id=p_user_id and archived_at is null and cycle_type='one_time' order by id loop
    perform public.finance_budget_reconcile(p_user_id,b.id,p_now);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('budget_id',x.id,'name',x.name,
    'cycle',public.finance_budget_cycle_json(p_user_id,c.id,(p_now at time zone x.time_zone)::date)) order by x.created_at,x.id),'[]'::jsonb)
  into ongoing from public.finance_budgets x join public.finance_budget_cycles c on c.budget_id=x.id and c.user_id=x.user_id and c.frozen_at is null
  where x.user_id=p_user_id and x.archived_at is null and x.cycle_type='one_time';
  return result||ongoing;
end;
$$;

do $verify$ begin
 if exists(select 1 from frozen_budgets_before b full join (select * from public.finance_budget_cycles where frozen_at is not null) c on c.id=b.id
  where b.original_row is distinct from to_jsonb(c)) then raise exception 'Frozen budget history changed'; end if;
end $verify$;
notify pgrst,'reload schema';
commit;
