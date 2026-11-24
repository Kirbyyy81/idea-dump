begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('idea-dump:finance-budget-closure',0));
lock table public.finance_budgets,public.finance_budget_filters,public.finance_budget_cycles in access exclusive mode;

-- Preserve the split-aware predecessor rather than replacing its ledger with
-- physical bank payments. No existing budget selections or history change.
do $$ begin
 if to_regclass('finance_private.ledger_entries') is null or to_regclass('finance_private.ledger_entry_tags') is null then
  raise exception 'Apply the split-aware Finance ledger migration before budget tag exclusions';
 end if;
end $$;
create temporary table budget_exclusion_frozen_before on commit drop as
 select id,to_jsonb(c) snapshot from public.finance_budget_cycles c where frozen_at is not null;

alter table public.finance_budget_filters drop constraint finance_budget_filters_check,
 add constraint finance_budget_filters_check check(
  (kind='source' and category_id is null and tag_id is null and (source_id is null or source_id=original_id))
  or (kind='category' and source_id is null and tag_id is null and (category_id is null or category_id=original_id))
  or (kind in ('tag','tag_exclude') and source_id is null and category_id is null and (tag_id is null or tag_id=original_id)));

create or replace function public.finance_budget_configuration(p_user_id uuid,p_budget_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v public.finance_budgets; sources jsonb; categories jsonb; tags jsonb; excluded_tags jsonb;
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
 select coalesce(jsonb_agg(jsonb_build_object('id',s.tag_id,'original_id',s.original_id,'name',coalesce(d.name,s.label),'is_archived',coalesce(d.is_archived,false)) order by s.label,s.original_id),'[]'::jsonb)
 into excluded_tags from public.finance_budget_filters s left join public.dim_finance_tags d on d.id=s.tag_id and d.user_id=p_user_id
 where s.budget_id=v.id and s.user_id=p_user_id and s.kind='tag_exclude';
 return jsonb_build_object('excluded_tags',excluded_tags,'excluded_tag_ids',coalesce((select jsonb_agg(x.tag_id order by x.tag_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.kind='tag_exclude' and x.tag_id is not null),'[]'::jsonb),'tags',tags,'tag_ids',coalesce((select jsonb_agg(x.tag_id order by x.tag_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.kind='tag' and x.tag_id is not null),'[]'::jsonb),'name',v.name,'amount',v.amount::text,'cycle_type',v.cycle_type,'start_date',v.start_date,
      'anchor_day',v.anchor_day,'custom_days',v.custom_days,'time_zone',v.time_zone,
      'filter_logic',v.filter_logic,'filter_group',v.filter_group,'include_uncategorised',v.include_uncategorised,'sources',sources,'categories',categories,
      'source_ids',coalesce((select jsonb_agg(x.source_id order by x.source_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.source_id is not null),'[]'::jsonb),
      'category_ids',coalesce((select jsonb_agg(x.category_id order by x.category_id) from public.finance_budget_filters x where x.budget_id=v.id and x.user_id=p_user_id and x.category_id is not null),'[]'::jsonb));
end;
$$;

create or replace function public.finance_budget_mutate(p_user_id uuid,p_action text,p_budget_id uuid default null,p_revision integer default null,
  p_request_id uuid default null,p_configuration jsonb default null,p_now timestamptz default now()) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare b public.finance_budgets; previous public.finance_budgets; c public.finance_budget_cycles;
  today date; earliest_start date; new_start date; name_value text; amount_value numeric; type_value text; days_value integer; anchor_value integer;
  group_value jsonb; zone_value text; source_ids uuid[]; category_ids uuid[]; tag_ids uuid[]; excluded_tag_ids uuid[]; schedule_changed boolean:=false; expected integer; actual integer;
begin
  if p_user_id is null or p_action is null or p_action not in ('create','update','archive','restore') then
    raise exception using errcode='22023',message='Invalid budget action';
  end if;
  if p_configuration ? 'filter_group' then
    p_configuration := jsonb_set(p_configuration, '{filter_group}',
      coalesce(finance_private.normalize_budget_filter_group(p_configuration->'filter_group'), 'null'::jsonb));
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
  group_value := case when p_configuration ? 'filter_group'
    then nullif(p_configuration->'filter_group', 'null'::jsonb) else previous.filter_group end;
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
  if p_configuration ? 'excluded_tag_ids' and jsonb_typeof(p_configuration->'excluded_tag_ids') is distinct from 'array' then raise exception using errcode='22023',message='excluded_tag_ids'; end if;
  begin
    if p_configuration ? 'excluded_tag_ids' then
      if jsonb_array_length(p_configuration->'excluded_tag_ids')>50 or exists(select 1 from jsonb_array_elements(p_configuration->'excluded_tag_ids') x where jsonb_typeof(x)<>'string') then raise exception using errcode='22023',message='excluded_tag_ids'; end if;
      select coalesce(array_agg(distinct x::uuid),array[]::uuid[]) into excluded_tag_ids from jsonb_array_elements_text(p_configuration->'excluded_tag_ids') x;
    else
      select coalesce(array_agg(original_id),array[]::uuid[]) into excluded_tag_ids from public.finance_budget_filters where budget_id=previous.id and user_id=p_user_id and kind='tag_exclude';
    end if;
  exception when invalid_text_representation then raise exception using errcode='22023',message='excluded_tag_ids'; end;
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


  perform 1 from public.dim_finance_tags where user_id=p_user_id and id=any(tag_ids || excluded_tag_ids) order by id for share;
  select count(*) into actual from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(tag_ids)
    and (not t.is_archived or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=previous.id and f.kind='tag' and f.tag_id=t.id));
  if cardinality(tag_ids)<>actual then raise exception using errcode='22023',message='tag_ids'; end if;
  select count(*) into actual from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(excluded_tag_ids)
    and (not t.is_archived or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=previous.id and f.kind='tag_exclude' and f.tag_id=t.id));
  if cardinality(excluded_tag_ids)<>actual then raise exception using errcode='22023',message='excluded_tag_ids'; end if;

  -- Freeze the old schedule with its old filters before changing current settings.
  if c.id is not null then
    if c.state='scheduled' then delete from public.finance_budget_cycles where id=c.id and user_id=p_user_id;
    elsif schedule_changed then perform public.finance_budget_close(p_user_id,c.id,today,'schedule',p_now); end if;
  end if;
  if p_action='create' then
    insert into public.finance_budgets(user_id,name,create_request_id,create_fingerprint,created_at,updated_at,
      amount,cycle_type,start_date,anchor_day,custom_days,time_zone,filter_logic,include_uncategorised,filter_group)
    values(p_user_id,name_value,p_request_id,md5(p_configuration::text),p_now,p_now,
      amount_value,type_value,new_start,anchor_value,days_value,zone_value,p_configuration->>'filter_logic',(p_configuration->>'include_uncategorised')::boolean,group_value) returning * into b;
  else
    update public.finance_budgets set name=name_value,amount=amount_value,cycle_type=type_value,start_date=new_start,
      anchor_day=anchor_value,custom_days=days_value,time_zone=zone_value,filter_logic=p_configuration->>'filter_logic',
      filter_group=group_value,include_uncategorised=(p_configuration->>'include_uncategorised')::boolean,archived_at=null,revision=revision+1,updated_at=p_now
    where id=b.id and user_id=p_user_id;
  end if;
  delete from public.finance_budget_filters where budget_id=b.id and user_id=p_user_id;
  insert into public.finance_budget_filters(budget_id,user_id,kind,source_id,original_id,label)
    select b.id,p_user_id,'source',s.id,s.id,s.name from public.dim_finance_sources s where s.user_id=p_user_id and s.id=any(source_ids);
  insert into public.finance_budget_filters(budget_id,user_id,kind,category_id,original_id,label)
    select b.id,p_user_id,'category',s.id,s.id,s.name from public.dim_finance_categories s where s.user_id=p_user_id and s.id=any(category_ids);
  insert into public.finance_budget_filters(budget_id,user_id,kind,tag_id,original_id,label)
    select b.id,p_user_id,'tag',t.id,t.id,t.name from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(tag_ids);
  insert into public.finance_budget_filters(budget_id,user_id,kind,tag_id,original_id,label)
    select b.id,p_user_id,'tag_exclude',t.id,t.id,t.name from public.dim_finance_tags t where t.user_id=p_user_id and t.id=any(excluded_tag_ids);
  if p_action in ('create','restore') or c.state='scheduled' or schedule_changed then
    insert into public.finance_budget_cycles(budget_id,user_id,start_date,end_date,state)
      values(b.id,p_user_id,new_start,public.finance_budget_next_boundary(new_start,type_value,days_value,anchor_value),case when new_start>today then 'scheduled' else 'active' end);
  end if;
  return b.id;
end;
$$;

create or replace function public.finance_budget_matching(p_user_id uuid,p_budget_id uuid,p_start date,p_end date)
returns setof public.finance_transactions language sql stable security invoker set search_path='' as $$
    with filters as (
        select b.*,
            exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='source') has_sources,
            (b.include_uncategorised or exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='category')) has_categories,
            exists(select 1 from public.finance_budget_filters f where f.user_id=p_user_id and f.budget_id=b.id and f.kind='tag') has_tags
        from public.finance_budgets b where b.user_id=p_user_id and b.id=p_budget_id
    ), matched as (
        select t.* from finance_private.ledger_entries t cross join filters f
        cross join lateral(select
            exists(select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.source_id=t.source_id) source_match,
            (t.category_id is null and f.include_uncategorised or exists(
                select 1 from public.finance_budget_filters x where x.user_id=p_user_id and x.budget_id=f.id and x.category_id=t.category_id)) category_match,
            exists(select 1 from public.finance_budget_filters x join finance_private.ledger_entry_tags tt
                on tt.user_id=x.user_id and tt.tag_id=x.tag_id
                where x.user_id=p_user_id and x.budget_id=f.id and x.kind='tag' and tt.entry_id=t.id) tag_match
        ) m
        where t.user_id=p_user_id and t.status='confirmed' and t.transfer_id is null
            and (p_start is null or t.transaction_date>=p_start) and (p_end is null or t.transaction_date<p_end)
            and not exists (
                select 1 from public.finance_budget_filters excluded
                join finance_private.ledger_entry_tags entry_tag
                    on entry_tag.user_id=excluded.user_id and entry_tag.tag_id=excluded.tag_id
                where excluded.user_id=p_user_id and excluded.budget_id=f.id
                    and excluded.kind='tag_exclude' and entry_tag.entry_id=t.id
            )
            and finance_private.budget_filter_matches(f.filter_logic, f.filter_group,
                case when f.has_sources then m.source_match end,
                case when f.has_categories then m.category_match end,
                case when f.has_tags then m.tag_match end)
    )
    select (case when m.split_payment_id is null then payment else
        jsonb_populate_record(payment,jsonb_build_object('id',m.id,'amount',m.amount,
            'category_id',m.category_id,'notes',m.notes,'intake_item_id',null,
            'manual_idempotency_key',null,'foreign_amount',null,'foreign_currency',null)) end).*
    from matched m join public.finance_transactions payment
        on payment.id=coalesce(m.split_payment_id,m.id) and payment.user_id=m.user_id;
$$;

create or replace function finance_private.reconcile_tag_budgets_before_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; b record;
begin
 owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if exists(select 1 from auth.users where id=owner_id) then
  perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||owner_id::text,0));
  for b in select x.id from public.finance_budgets x where x.user_id=owner_id and x.archived_at is null
   and exists(select 1 from public.finance_budget_filters f where f.budget_id=x.id and f.user_id=owner_id and f.kind in ('tag','tag_exclude')) order by x.id loop
   perform public.finance_budget_reconcile(owner_id,b.id);
  end loop;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Omitted settings preserve selections; explicit [] clears them. Future frozen
-- snapshots get the new metadata naturally through finance_budget_configuration.
do $$ begin
 if exists((select snapshot from budget_exclusion_frozen_before except
  select to_jsonb(c) from public.finance_budget_cycles c where frozen_at is not null)
  union all (select to_jsonb(c) from public.finance_budget_cycles c where frozen_at is not null
   except select snapshot from budget_exclusion_frozen_before)) then
  raise exception 'Budget tag exclusions changed frozen history';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
