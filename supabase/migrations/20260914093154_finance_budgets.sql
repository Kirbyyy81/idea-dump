-- Personal budgets. All access is through authorized server services.
create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  revision integer not null default 1 check (revision > 0),
  current_version_id uuid,
  archived_at timestamptz,
  create_request_id uuid not null,
  create_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, create_request_id)
);
create unique index finance_budgets_live_name_idx on public.finance_budgets(user_id, lower(btrim(name))) where archived_at is null;
create index finance_budgets_owner_state_idx on public.finance_budgets(user_id, archived_at, created_at, id);

create table public.finance_budget_versions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  user_id uuid not null,
  name text not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  cycle_type text not null check (cycle_type in ('weekly','monthly','custom')),
  start_date date not null check (start_date between date '1900-01-01' and date '9998-12-31'),
  anchor_day integer,
  custom_days integer,
  time_zone text not null,
  filter_logic text not null check (filter_logic in ('and','or')),
  include_uncategorised boolean not null default false,
  effective_date date not null,
  created_at timestamptz not null default now(),
  unique (id, user_id), unique (id, budget_id, user_id),
  foreign key (budget_id,user_id) references public.finance_budgets(id,user_id) on delete cascade,
  check ((cycle_type = 'monthly' and anchor_day is not null and anchor_day between 1 and 31) or (cycle_type <> 'monthly' and anchor_day is null)),
  check ((cycle_type = 'custom' and custom_days is not null and custom_days between 1 and 365) or (cycle_type <> 'custom' and custom_days is null))
);
alter table public.finance_budgets add constraint finance_budgets_current_version_fkey
  foreign key (current_version_id,id,user_id) references public.finance_budget_versions(id,budget_id,user_id)
  deferrable initially deferred;
create index finance_budgets_current_version_idx on public.finance_budgets(current_version_id,id,user_id);
create index finance_budget_versions_owner_idx on public.finance_budget_versions(budget_id,user_id,created_at);

create table public.finance_budget_version_sources (
  version_id uuid not null,
  user_id uuid not null,
  source_id uuid,
  original_id uuid not null,
  label text not null,
  primary key (version_id,original_id),
  foreign key (version_id,user_id) references public.finance_budget_versions(id,user_id) on delete cascade,
  foreign key (source_id,user_id) references public.dim_finance_sources(id,user_id) on delete set null (source_id),
  check (source_id is null or source_id = original_id)
);
create index finance_budget_version_sources_ref_idx on public.finance_budget_version_sources(source_id,user_id);
create table public.finance_budget_version_categories (
  version_id uuid not null,
  user_id uuid not null,
  category_id uuid,
  original_id uuid not null,
  label text not null,
  primary key (version_id,original_id),
  foreign key (version_id,user_id) references public.finance_budget_versions(id,user_id) on delete cascade,
  foreign key (category_id,user_id) references public.dim_finance_categories(id,user_id) on delete set null (category_id),
  check (category_id is null or category_id = original_id)
);
create index finance_budget_version_categories_ref_idx on public.finance_budget_version_categories(category_id,user_id);

create table public.finance_budget_cycles (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  user_id uuid not null,
  version_id uuid not null,
  start_date date not null,
  end_date date not null check (end_date > start_date),
  state text not null check (state in ('scheduled','active','completed','partial')),
  close_reason text check (close_reason in ('completed','schedule','archived')),
  frozen_at timestamptz,
  expense numeric, income numeric, net_spending numeric, used_amount numeric,
  remaining numeric, over_amount numeric, usage_percentage numeric, pace_percentage numeric,
  status text check (status in ('scheduled','over_budget','limit_reached','needs_attention','on_track')),
  unique (id,user_id), unique (budget_id,version_id,start_date),
  foreign key (budget_id,user_id) references public.finance_budgets(id,user_id) on delete cascade,
  foreign key (version_id,budget_id,user_id) references public.finance_budget_versions(id,budget_id,user_id),
  check ((state in ('completed','partial')) = (frozen_at is not null)),
  check ((frozen_at is null and close_reason is null) or (frozen_at is not null and close_reason is not null
    and expense is not null and income is not null and net_spending is not null and used_amount is not null
    and remaining is not null and over_amount is not null and usage_percentage is not null and pace_percentage is not null and status is not null))
);
create unique index finance_budget_cycles_open_idx on public.finance_budget_cycles(budget_id) where frozen_at is null;
create index finance_budget_cycles_history_idx on public.finance_budget_cycles(user_id,budget_id,start_date desc,id);
create index finance_budget_cycles_due_idx on public.finance_budget_cycles(end_date,budget_id) where frozen_at is null;
create index finance_budget_cycles_version_idx on public.finance_budget_cycles(version_id,budget_id,user_id);

create table public.finance_budget_cycle_breakdowns (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null,
  user_id uuid not null,
  dimension text not null check (dimension in ('source','category')),
  reference_id uuid,
  label text not null,
  expense numeric not null check (expense >= 0),
  income numeric not null check (income >= 0),
  net_spending numeric not null,
  foreign key (cycle_id,user_id) references public.finance_budget_cycles(id,user_id) on delete cascade,
  unique nulls not distinct (cycle_id,dimension,reference_id)
);
create index finance_budget_breakdowns_owner_idx on public.finance_budget_cycle_breakdowns(user_id,cycle_id);

create function public.finance_budget_require_version() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from public.finance_budgets where id=new.id and user_id=new.user_id and current_version_id is null) then
    raise exception using errcode='23514',message='A budget must have a configuration version';
  end if;
  return new;
end;
$$;
create constraint trigger finance_budget_has_version after insert or update on public.finance_budgets
  deferrable initially deferred for each row execute function public.finance_budget_require_version();

create function public.finance_budget_breakdown_open() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.finance_budget_cycles where id=new.cycle_id and user_id=new.user_id and frozen_at is null for update;
  if not found then raise exception using errcode='23514',message='Frozen budget breakdowns cannot change'; end if;
  return new;
end;
$$;
create trigger finance_budget_breakdown_insert before insert on public.finance_budget_cycle_breakdowns
  for each row execute function public.finance_budget_breakdown_open();

-- Trigger-only retention guards need Auth visibility for the account-deletion cascade.
-- They expose no Auth data and use only schema-qualified tables and the triggering row.
create function public.finance_budget_immutable() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Preserve the existing user-account retention cascade.
  if tg_op = 'DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  if tg_table_name='finance_budget_cycles' then
    if old.frozen_at is null then
      if tg_op='DELETE' then return old; end if;
      return new;
    end if;
  end if;
  raise exception using errcode='23514',message='Frozen budget history cannot change';
end;
$$;

create function public.finance_budget_validate_version() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.time_zone) then
    raise exception using errcode='22023',message='time_zone';
  end if;
  return new;
end;
$$;
create trigger finance_budget_version_time_zone before insert on public.finance_budget_versions
  for each row execute function public.finance_budget_validate_version();
create trigger finance_budget_versions_immutable before update or delete on public.finance_budget_versions
  for each row execute function public.finance_budget_immutable();
create trigger finance_budget_cycles_immutable before update or delete on public.finance_budget_cycles
  for each row execute function public.finance_budget_immutable();
create trigger finance_budget_breakdowns_immutable before update or delete on public.finance_budget_cycle_breakdowns
  for each row execute function public.finance_budget_immutable();

-- Selection configuration is immutable after a version is activated. The only
-- later change is a deleted dimension becoming NULL while identity/label survive.
create function public.finance_budget_selection_immutable() returns trigger language plpgsql security definer set search_path = '' as $$
declare reference_field text;
begin
  if tg_op='DELETE' then
    if not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  elsif tg_op='INSERT' then
    if not exists(select 1 from public.finance_budgets where current_version_id=new.version_id and user_id=new.user_id)
      and not exists(select 1 from public.finance_budget_cycles where version_id=new.version_id and user_id=new.user_id) then return new; end if;
  else
    reference_field:=case when tg_table_name='finance_budget_version_sources' then 'source_id' else 'category_id' end;
    if to_jsonb(new)-reference_field = to_jsonb(old)-reference_field
      and to_jsonb(new)->reference_field = 'null'::jsonb and to_jsonb(old)->reference_field <> 'null'::jsonb then
      if tg_table_name='finance_budget_version_sources' then
        if not exists(select 1 from public.dim_finance_sources where id=old.original_id and user_id=old.user_id) then return new; end if;
      else
        if not exists(select 1 from public.dim_finance_categories where id=old.original_id and user_id=old.user_id) then return new; end if;
      end if;
    end if;
  end if;
  raise exception using errcode='23514',message='Saved budget selections cannot change';
end;
$$;
create trigger finance_budget_sources_immutable before insert or update or delete on public.finance_budget_version_sources
  for each row execute function public.finance_budget_selection_immutable();
create trigger finance_budget_categories_immutable before insert or update or delete on public.finance_budget_version_categories
  for each row execute function public.finance_budget_selection_immutable();

create function public.finance_budget_guard_reference_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
  if tg_table_name='dim_finance_sources' then
    if exists(select 1 from public.finance_budget_version_sources s join public.finance_budgets b on b.current_version_id=s.version_id and b.user_id=s.user_id
      where s.source_id=old.id and s.user_id=old.user_id and b.archived_at is null) then
      raise exception using errcode='23503',message='Source is selected by a budget';
    end if;
  else
    if exists(select 1 from public.finance_budget_version_categories s join public.finance_budgets b on b.current_version_id=s.version_id and b.user_id=s.user_id
      where s.category_id=old.id and s.user_id=old.user_id and b.archived_at is null) then
      raise exception using errcode='23503',message='Category is selected by a budget';
    end if;
  end if;
  return old;
end;
$$;
create trigger finance_budget_source_delete before delete on public.dim_finance_sources for each row execute function public.finance_budget_guard_reference_delete();
create trigger finance_budget_category_delete before delete on public.dim_finance_categories for each row execute function public.finance_budget_guard_reference_delete();

create function public.finance_budget_next_boundary(p_start date,p_type text,p_days integer,p_anchor integer) returns date
language plpgsql immutable security invoker set search_path = '' as $$
declare boundary date; month_start date;
begin
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

create function public.finance_budget_matching(p_user_id uuid,p_version_id uuid,p_start date,p_end date)
returns setof public.finance_transactions language sql stable security invoker set search_path = '' as $$
  with filters as (
    select v.*,
      exists(select 1 from public.finance_budget_version_sources s where s.version_id=v.id and s.user_id=p_user_id) has_sources,
      (v.include_uncategorised or exists(select 1 from public.finance_budget_version_categories c where c.version_id=v.id and c.user_id=p_user_id)) has_categories
    from public.finance_budget_versions v where v.id=p_version_id and v.user_id=p_user_id
  )
  select t.* from public.finance_transactions t cross join filters f
  cross join lateral (select
    exists(select 1 from public.finance_budget_version_sources s where s.version_id=f.id and s.user_id=p_user_id and s.source_id=t.source_id) source_match,
    ((t.category_id is null and f.include_uncategorised) or exists(select 1 from public.finance_budget_version_categories c where c.version_id=f.id and c.user_id=p_user_id and c.category_id=t.category_id)) category_match
  ) m
  where t.user_id=p_user_id and t.status='confirmed' and t.transaction_date>=p_start and t.transaction_date<p_end
    and case when not f.has_sources and not f.has_categories then true
      when not f.has_sources then m.category_match when not f.has_categories then m.source_match
      when f.filter_logic='and' then m.source_match and m.category_match else m.source_match or m.category_match end;
$$;

create function public.finance_budget_metrics(p_amount numeric,p_expense numeric,p_income numeric,p_start date,p_end date,p_today date)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare net numeric:=p_expense-p_income; used numeric:=greatest(net,0); days integer:=p_end-p_start;
  elapsed integer:=greatest(0,least(days,p_today-p_start)); budget_status text;
begin
  if p_amount<=0 or days<=0 then raise exception using errcode='22023',message='Invalid budget calculation'; end if;
  budget_status:=case when p_today<p_start then 'scheduled' when used>p_amount then 'over_budget'
    when used=p_amount then 'limit_reached' when used*5>=p_amount*4 or used*days>p_amount*elapsed then 'needs_attention' else 'on_track' end;
  return jsonb_build_object('amount',round(p_amount,2)::text,'expense',round(p_expense,2)::text,'income',round(p_income,2)::text,
    'net_spending',round(net,2)::text,'used_amount',round(used,2)::text,'remaining',round(greatest(p_amount-used,0),2)::text,
    'over_amount',round(greatest(used-p_amount,0),2)::text,'usage_percentage',round(used/p_amount*100,6)::text,
    'pace_percentage',round(elapsed::numeric/days*100,6)::text,'status',budget_status);
end;
$$;

create function public.finance_budget_aggregate(p_user_id uuid,p_version_id uuid,p_start date,p_end date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with matched as materialized (
    select t.*,s.name source_name,coalesce(c.name,'Uncategorised') category_name
    from public.finance_budget_matching(p_user_id,p_version_id,p_start,p_end) t
    join public.dim_finance_sources s on s.id=t.source_id and s.user_id=p_user_id
    left join public.dim_finance_categories c on c.id=t.category_id and c.user_id=p_user_id
  ), totals as (select coalesce(sum(amount) filter(where direction='expense'),0) expense,
    coalesce(sum(amount) filter(where direction='income'),0) income from matched), breakdowns as (
    select 'source'::text dimension,source_id reference_id,source_name label,
      coalesce(sum(amount) filter(where direction='expense'),0) expense,coalesce(sum(amount) filter(where direction='income'),0) income
      from matched group by source_id,source_name
    union all
    select 'category',category_id,category_name,
      coalesce(sum(amount) filter(where direction='expense'),0),coalesce(sum(amount) filter(where direction='income'),0)
      from matched group by category_id,category_name
  )
  select jsonb_build_object('expense',round(t.expense,2)::text,'income',round(t.income,2)::text,
    'breakdowns',coalesce((select jsonb_agg(jsonb_build_object('dimension',dimension,'reference_id',reference_id,'label',label,
      'expense',round(expense,2)::text,'income',round(income,2)::text,'net_spending',round(expense-income,2)::text) order by dimension,label,reference_id) from breakdowns),'[]'::jsonb)) from totals t;
$$;

create function public.finance_budget_close(p_user_id uuid,p_cycle_id uuid,p_end date,p_reason text,p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path = '' as $$
declare c public.finance_budget_cycles; v public.finance_budget_versions; aggregate jsonb; metrics jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  select * into c from public.finance_budget_cycles where id=p_cycle_id and user_id=p_user_id for update;
  if not found or c.frozen_at is not null then return; end if;
  if p_end<=c.start_date then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id; return; end if;
  if p_end>c.end_date or p_reason not in ('completed','schedule','archived') then raise exception using errcode='22023',message='Invalid cycle closure'; end if;
  select * into strict v from public.finance_budget_versions where id=c.version_id and user_id=p_user_id;
  aggregate:=public.finance_budget_aggregate(p_user_id,v.id,c.start_date,p_end);
  metrics:=public.finance_budget_metrics(v.amount,(aggregate->>'expense')::numeric,(aggregate->>'income')::numeric,c.start_date,p_end,p_end);
  insert into public.finance_budget_cycle_breakdowns(cycle_id,user_id,dimension,reference_id,label,expense,income,net_spending)
    select c.id,p_user_id,x.dimension,x.reference_id,x.label,x.expense,x.income,x.net_spending
    from jsonb_to_recordset(aggregate->'breakdowns') as x(dimension text,reference_id uuid,label text,expense numeric,income numeric,net_spending numeric);
  update public.finance_budget_cycles set end_date=p_end,state=case when p_reason='completed' then 'completed' else 'partial' end,
    close_reason=p_reason,frozen_at=p_now,expense=(metrics->>'expense')::numeric,income=(metrics->>'income')::numeric,
    net_spending=(metrics->>'net_spending')::numeric,used_amount=(metrics->>'used_amount')::numeric,
    remaining=(metrics->>'remaining')::numeric,over_amount=(metrics->>'over_amount')::numeric,
    usage_percentage=(metrics->>'usage_percentage')::numeric,pace_percentage=(metrics->>'pace_percentage')::numeric,status=metrics->>'status'
    where id=c.id and user_id=p_user_id;
end;
$$;

create function public.finance_budget_reconcile(p_user_id uuid,p_budget_id uuid,p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; v public.finance_budget_versions; c public.finance_budget_cycles; today date; next_start date;
begin
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
  select * into b from public.finance_budgets where id=p_budget_id and user_id=p_user_id for update;
  if not found or b.archived_at is not null then return; end if;
  select * into strict v from public.finance_budget_versions where id=b.current_version_id and user_id=p_user_id;
  today:=(p_now at time zone v.time_zone)::date;
  loop
    select * into c from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id and frozen_at is null for update;
    if not found then
      select coalesce(max(end_date),v.start_date) into next_start from public.finance_budget_cycles where budget_id=b.id and user_id=p_user_id;
      next_start:=greatest(next_start,v.start_date);
      insert into public.finance_budget_cycles(budget_id,user_id,version_id,start_date,end_date,state)
        values(b.id,p_user_id,v.id,next_start,public.finance_budget_next_boundary(next_start,v.cycle_type,v.custom_days,v.anchor_day),
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

create function public.finance_budget_mutate(p_user_id uuid,p_action text,p_budget_id uuid default null,p_revision integer default null,
  p_request_id uuid default null,p_configuration jsonb default null,p_now timestamptz default now()) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; previous public.finance_budget_versions; v public.finance_budget_versions; c public.finance_budget_cycles;
  today date; new_start date; name_value text; amount_value numeric; type_value text; days_value integer; anchor_value integer;
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
    select * into strict previous from public.finance_budget_versions where id=b.current_version_id and user_id=p_user_id;
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
    if new_start<today then raise exception using errcode='22023',message='start_date'; end if;
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
    and (not s.is_archived or exists(select 1 from public.finance_budget_version_sources x where x.version_id=previous.id and x.user_id=p_user_id and x.source_id=s.id));
  if expected<>actual then raise exception using errcode='22023',message='source_ids'; end if;
  perform 1 from public.dim_finance_categories where user_id=p_user_id and id=any(category_ids) order by id for share;
  expected:=cardinality(category_ids);
  select count(*) into actual from public.dim_finance_categories s where s.user_id=p_user_id and s.id=any(category_ids)
    and (not s.is_archived or exists(select 1 from public.finance_budget_version_categories x where x.version_id=previous.id and x.user_id=p_user_id and x.category_id=s.id));
  if expected<>actual then raise exception using errcode='22023',message='category_ids'; end if;

  if p_action='create' then
    insert into public.finance_budgets(user_id,name,create_request_id,create_fingerprint,created_at,updated_at)
      values(p_user_id,name_value,p_request_id,md5(p_configuration::text),p_now,p_now) returning * into b;
  end if;
  insert into public.finance_budget_versions(budget_id,user_id,name,amount,cycle_type,start_date,anchor_day,custom_days,time_zone,filter_logic,include_uncategorised,effective_date,created_at)
    values(b.id,p_user_id,name_value,amount_value,type_value,new_start,anchor_value,days_value,zone_value,p_configuration->>'filter_logic',
      (p_configuration->>'include_uncategorised')::boolean,today,p_now) returning * into v;
  insert into public.finance_budget_version_sources(version_id,user_id,source_id,original_id,label)
    select v.id,p_user_id,s.id,s.id,s.name from public.dim_finance_sources s where s.user_id=p_user_id and s.id=any(source_ids);
  insert into public.finance_budget_version_categories(version_id,user_id,category_id,original_id,label)
    select v.id,p_user_id,s.id,s.id,s.name from public.dim_finance_categories s where s.user_id=p_user_id and s.id=any(category_ids);
  if c.id is not null then
    if c.state='scheduled' then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id;
    elsif schedule_changed then perform public.finance_budget_close(p_user_id,c.id,today,'schedule',p_now);
    else update public.finance_budget_cycles set version_id=v.id where id=c.id and user_id=p_user_id; end if;
  end if;
  update public.finance_budgets set name=name_value,current_version_id=v.id,archived_at=null,
    revision=case when p_action='create' then revision else revision+1 end,updated_at=p_now where id=b.id and user_id=p_user_id;
  if p_action in ('create','restore') or c.state='scheduled' or schedule_changed then
    insert into public.finance_budget_cycles(budget_id,user_id,version_id,start_date,end_date,state)
      values(b.id,p_user_id,v.id,new_start,public.finance_budget_next_boundary(new_start,type_value,days_value,anchor_value),case when new_start>today then 'scheduled' else 'active' end);
  end if;
  return b.id;
end;
$$;

create function public.finance_budget_cycle_json(p_user_id uuid,p_cycle_id uuid,p_today date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare c public.finance_budget_cycles; v public.finance_budget_versions; aggregate jsonb; metrics jsonb; breakdowns jsonb;
begin
  select * into c from public.finance_budget_cycles where id=p_cycle_id and user_id=p_user_id;
  if not found then return null; end if;
  select * into strict v from public.finance_budget_versions where id=c.version_id and user_id=p_user_id;
  if c.frozen_at is null then
    if c.start_date>p_today then aggregate:='{"expense":"0.00","income":"0.00","breakdowns":[]}'::jsonb;
    else aggregate:=public.finance_budget_aggregate(p_user_id,v.id,c.start_date,c.end_date); end if;
    metrics:=public.finance_budget_metrics(v.amount,(aggregate->>'expense')::numeric,(aggregate->>'income')::numeric,c.start_date,c.end_date,p_today);
    breakdowns:=aggregate->'breakdowns';
  else
    metrics:=jsonb_build_object('amount',v.amount::text,'expense',round(c.expense,2)::text,'income',round(c.income,2)::text,
      'net_spending',round(c.net_spending,2)::text,'used_amount',round(c.used_amount,2)::text,'remaining',round(c.remaining,2)::text,
      'over_amount',round(c.over_amount,2)::text,'usage_percentage',c.usage_percentage::text,'pace_percentage',c.pace_percentage::text,'status',c.status);
    select coalesce(jsonb_agg(jsonb_build_object('dimension',x.dimension,'reference_id',x.reference_id,'label',x.label,
      'expense',round(x.expense,2)::text,'income',round(x.income,2)::text,'net_spending',round(x.net_spending,2)::text) order by x.dimension,x.label,x.reference_id),'[]'::jsonb)
      into breakdowns from public.finance_budget_cycle_breakdowns x where x.cycle_id=c.id and x.user_id=p_user_id;
  end if;
  return jsonb_build_object('id',c.id,'start_date',c.start_date,'end_date',c.end_date,'state',c.state,'close_reason',c.close_reason,
    'frozen_at',c.frozen_at,'metrics',metrics,'breakdowns',breakdowns);
end;
$$;

create function public.finance_budget_summary(p_user_id uuid,p_budget_id uuid,p_now timestamptz default now()) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare b public.finance_budgets; v public.finance_budget_versions; today date; cycle jsonb; sources jsonb; categories jsonb; budget_state text;
begin
  select * into b from public.finance_budgets where id=p_budget_id and user_id=p_user_id;
  if not found then raise exception using errcode='P0002',message='Budget not found'; end if;
  select * into strict v from public.finance_budget_versions where id=b.current_version_id and user_id=p_user_id;
  today:=(p_now at time zone v.time_zone)::date;
  select public.finance_budget_cycle_json(p_user_id,c.id,today) into cycle from public.finance_budget_cycles c
    where c.budget_id=b.id and c.user_id=p_user_id and c.frozen_at is null;
  budget_state:=case when b.archived_at is not null then 'archived' when v.start_date>today then 'scheduled' else 'active' end;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.source_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into sources from public.finance_budget_version_sources s left join public.dim_finance_sources d on d.id=s.source_id and d.user_id=p_user_id where s.version_id=v.id and s.user_id=p_user_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.category_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
    into categories from public.finance_budget_version_categories s left join public.dim_finance_categories d on d.id=s.category_id and d.user_id=p_user_id where s.version_id=v.id and s.user_id=p_user_id;
  return jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,'state',budget_state,
    'status',case when budget_state='active' then cycle->'metrics'->>'status' else budget_state end,'today',today,'current_cycle',cycle,
    'version',jsonb_build_object('id',v.id,'name',v.name,'amount',v.amount::text,'cycle_type',v.cycle_type,'start_date',v.start_date,
      'anchor_day',v.anchor_day,'custom_days',v.custom_days,'time_zone',v.time_zone,'effective_date',v.effective_date,
      'filter_logic',v.filter_logic,'include_uncategorised',v.include_uncategorised,'sources',sources,'categories',categories,
      'source_ids',coalesce((select jsonb_agg(x.source_id order by x.source_id) from public.finance_budget_version_sources x where x.version_id=v.id and x.user_id=p_user_id and x.source_id is not null),'[]'::jsonb),
      'category_ids',coalesce((select jsonb_agg(x.category_id order by x.category_id) from public.finance_budget_version_categories x where x.version_id=v.id and x.user_id=p_user_id and x.category_id is not null),'[]'::jsonb)));
end;
$$;

create function public.finance_budget_list(p_user_id uuid,p_state text default 'active',p_page integer default 1,p_page_size integer default 20,
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
    from public.finance_budgets x join public.finance_budget_versions v on v.id=x.current_version_id and v.user_id=p_user_id
    where x.user_id=p_user_id and case when p_dashboard then x.archived_at is null and v.start_date<=(p_now at time zone v.time_zone)::date
      when p_state='all' then true when p_state='archived' then x.archived_at is not null
      when p_state='scheduled' then x.archived_at is null and v.start_date>(p_now at time zone v.time_zone)::date
      else x.archived_at is null and v.start_date<=(p_now at time zone v.time_zone)::date end
  ), selected as (
    select item from summaries order by
      case when p_dashboard then case item->>'status' when 'over_budget' then 0 when 'limit_reached' then 1 when 'needs_attention' then 2 else 3 end else 0 end,
      -- 32 fractional places distinguish ratios whose minor-unit denominators are at most 14 digits.
      case when p_dashboard then round((item->'current_cycle'->'metrics'->>'used_amount')::numeric,32) / (item->'version'->>'amount')::numeric else 0 end desc,
      case when not p_dashboard then created_at end desc,item->>'id'
    limit case when p_dashboard then 3 else p_page_size end offset case when p_dashboard then 0 else (p_page-1)*p_page_size end
  ) select jsonb_build_object('data',coalesce((select jsonb_agg(item) from selected),'[]'::jsonb),'total',(select count(*) from summaries),
    'page',case when p_dashboard then 1 else p_page end,'page_size',case when p_dashboard then 3 else p_page_size end) into result;
  return result;
end;
$$;

create function public.finance_budget_detail(p_user_id uuid,p_budget_id uuid,p_history_page integer default 1,p_history_page_size integer default 20,
  p_transactions_page integer default 1,p_transactions_page_size integer default 50,p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare summary jsonb; history jsonb; transactions jsonb; today date; c public.finance_budget_cycles; history_total bigint; transactions_total bigint:=0;
begin
  if p_history_page is null or p_history_page not between 1 and 1000000 or p_transactions_page is null or p_transactions_page not between 1 and 1000000
    or p_history_page_size is null or p_history_page_size not between 1 and 100 or p_transactions_page_size is null or p_transactions_page_size not between 1 and 100 then
    raise exception using errcode='22023',message='Invalid pagination'; end if;
  perform public.finance_budget_reconcile(p_user_id,p_budget_id,p_now);
  summary:=public.finance_budget_summary(p_user_id,p_budget_id,p_now);
  today:=(summary->>'today')::date;
  select count(*) into history_total from public.finance_budget_cycles where budget_id=p_budget_id and user_id=p_user_id and frozen_at is not null;
  select coalesce(jsonb_agg(public.finance_budget_cycle_json(p_user_id,x.id,today) order by x.start_date desc,x.frozen_at desc,x.id),'[]'::jsonb) into history
    from (select * from public.finance_budget_cycles where budget_id=p_budget_id and user_id=p_user_id and frozen_at is not null
      order by start_date desc,frozen_at desc,id limit p_history_page_size offset (p_history_page-1)*p_history_page_size) x;
  transactions:='[]'::jsonb;
  if summary->>'state'='active' then
    select * into c from public.finance_budget_cycles where budget_id=p_budget_id and user_id=p_user_id and frozen_at is null;
    select count(*) into transactions_total from public.finance_budget_matching(p_user_id,c.version_id,c.start_date,c.end_date);
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'transaction_date',x.transaction_date,'direction',x.direction,'amount',x.amount::text,
      'merchant',coalesce(p.name,x.merchant),'source_name',s.name,'category_name',coalesce(cat.name,'Uncategorised')) order by x.transaction_date desc,x.created_at desc,x.id),'[]'::jsonb) into transactions
      from (select * from public.finance_budget_matching(p_user_id,c.version_id,c.start_date,c.end_date)
        order by transaction_date desc,created_at desc,id limit p_transactions_page_size offset (p_transactions_page-1)*p_transactions_page_size) x
      join public.dim_finance_sources s on s.id=x.source_id and s.user_id=p_user_id
      left join public.dim_finance_categories cat on cat.id=x.category_id and cat.user_id=p_user_id
      left join public.dim_finance_payees p on p.id=x.payee_id and p.user_id=p_user_id;
  end if;
  return jsonb_build_object('budget',summary,
    'history',jsonb_build_object('data',history,'total',history_total,'page',p_history_page,'page_size',p_history_page_size),
    'transactions',jsonb_build_object('data',transactions,'total',transactions_total,'page',p_transactions_page,'page_size',p_transactions_page_size));
end;
$$;

create function public.finance_budget_close_due(p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path = '' as $$
declare b record; processed integer:=0; backlog bigint;
begin
  -- A single worker catches up each overdue schedule; per-budget work rolls back on failure.
  if not pg_try_advisory_xact_lock(hashtextextended('idea-dump:finance-budget-closure',0)) then return 0; end if;
  for b in select x.id,x.user_id from public.finance_budgets x join public.finance_budget_versions v on v.id=x.current_version_id and v.user_id=x.user_id
    join public.finance_budget_cycles c on c.budget_id=x.id and c.user_id=x.user_id and c.frozen_at is null
    where x.archived_at is null and (c.end_date<=(p_now at time zone v.time_zone)::date or (c.state='scheduled' and c.start_date<=(p_now at time zone v.time_zone)::date))
    order by x.user_id,x.id
  loop
    begin
      if pg_try_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||b.user_id::text,0)) then
        perform public.finance_budget_reconcile(b.user_id,b.id,p_now);
        processed:=processed+1;
      end if;
    exception when others then
      raise warning 'Finance budget closure failed for budget %, SQLSTATE %',b.id,sqlstate;
    end;
  end loop;
  select count(*) into backlog from public.finance_budget_cycles c join public.finance_budget_versions v on v.id=c.version_id and v.user_id=c.user_id
    where c.frozen_at is null and c.end_date<=(p_now at time zone v.time_zone)::date;
  if backlog>0 then raise warning 'Finance budget closure backlog: % overdue cycles',backlog; end if;
  return processed;
end;
$$;

do $security$
declare table_name text; fn record;
begin
  foreach table_name in array array['finance_budgets','finance_budget_versions','finance_budget_version_sources','finance_budget_version_categories','finance_budget_cycles','finance_budget_cycle_breakdowns'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy server_only_deny on public.%I as restrictive for all to anon,authenticated using (false) with check (false)',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on public.%I to service_role',table_name);
  end loop;
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'finance_budget_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end;
$security$;
revoke execute on function public.finance_budget_close_due(timestamptz) from service_role;

do $cron$
declare job_id bigint;
begin
  if to_regclass('cron.job') is null then raise exception 'Supabase Cron must be enabled before installing Finance budgets'; end if;
  select jobid into job_id from cron.job where jobname='finance-budget-closure';
  if job_id is null then
    perform cron.schedule('finance-budget-closure','0 * * * *','SET statement_timeout = ''90s''; SELECT public.finance_budget_close_due();');
  else
    perform cron.alter_job(job_id,schedule:='0 * * * *',command:='SET statement_timeout = ''90s''; SELECT public.finance_budget_close_due();',active:=true);
  end if;
end;
$cron$;
