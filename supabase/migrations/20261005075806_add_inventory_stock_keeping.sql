-- Personal inventory uses the application's server-only data boundary.
insert into public.dim_modules(modules,name,path,sort_order,is_managed,is_always_allowed,icon,description,enabled)
values('inventory','Inventory','/inventory',86,true,false,'Package','Personal stock, purchases, and usage.',true)
on conflict(modules) do update set name=excluded.name,path=excluded.path,sort_order=excluded.sort_order,
  is_managed=excluded.is_managed,is_always_allowed=excluded.is_always_allowed,icon=excluded.icon,description=excluded.description,enabled=excluded.enabled;
insert into public.bridge_role_modules(role_id,module_id)
select r.id,m.id from public.dim_roles r cross join public.dim_modules m where r.role='owner' and m.modules='inventory'
on conflict do nothing;

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  brand text check(brand is null or length(btrim(brand)) between 1 and 120),
  category text not null check(length(btrim(category)) between 1 and 60),
  unit text not null check(unit in ('ml','g','count')),
  item_label text not null check(length(btrim(item_label)) between 1 and 30),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
create unique index inventory_product_name on public.inventory_products(user_id,lower(name));
create table public.inventory_variants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, product_id uuid not null,
  label text not null check(length(btrim(label)) between 1 and 120),
  size numeric(12,3) not null check(size>0 and size<=100000),
  pack_quantity integer not null check(pack_quantity between 1 and 1000),
  sheets_per_item integer check(sheets_per_item between 1 and 10000),
  unique(user_id,id), unique(user_id,product_id,id),
  foreign key(user_id,product_id) references public.inventory_products(user_id,id) on delete cascade
);
create unique index inventory_variant_name on public.inventory_variants(user_id,product_id,lower(label));
create table public.inventory_purchases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('purchase','existing')), purchased_on date,
  currency text not null default 'MYR' check(currency='MYR'),
  finance_transaction_id uuid references public.finance_transactions(id) on delete set null,
  created_at timestamptz not null default now(), unique(user_id,id),
  check(kind='existing' or purchased_on is not null)
);
create index inventory_purchase_date on public.inventory_purchases(user_id,purchased_on desc);
create index inventory_purchase_finance on public.inventory_purchases(finance_transaction_id) where finance_transaction_id is not null;
create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  purchase_id uuid not null, product_id uuid not null, variant_id uuid not null,
  purchased_quantity integer not null check(purchased_quantity between 1 and 1000),
  original_units integer not null check(original_units between 1 and 10000),
  unopened_units integer not null check(unopened_units between 0 and 10000),
  total_paid numeric(14,2) check(total_paid between 0 and 1000000),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  created_at timestamptz not null default now(), unique(user_id,id),
  foreign key(user_id,purchase_id) references public.inventory_purchases(user_id,id) on delete cascade,
  foreign key(user_id,product_id,variant_id) references public.inventory_variants(user_id,product_id,id) on delete cascade
);
create index inventory_batch_purchase on public.inventory_batches(user_id,purchase_id);
create index inventory_batch_product on public.inventory_batches(user_id,product_id,variant_id);
create table public.inventory_usages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, batch_id uuid not null,
  status text not null default 'in_use' check(status in ('in_use','finished','removed')),
  started_on date, finished_on date, revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(), unique(user_id,id),
  foreign key(user_id,batch_id) references public.inventory_batches(user_id,id) on delete cascade,
  check(finished_on is null or started_on is null or finished_on>=started_on),
  check((status='finished' and finished_on is not null) or (status<>'finished' and finished_on is null))
);
create index inventory_usage_batch on public.inventory_usages(user_id,batch_id);
create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, batch_id uuid not null, usage_id uuid,
  quantity integer not null check(quantity<>0 and quantity between -10000 and 10000),
  reason text not null check(reason in ('correction','discarded','lost','given_away')),
  adjusted_on date not null, created_at timestamptz not null default now(),
  foreign key(user_id,batch_id) references public.inventory_batches(user_id,id) on delete cascade,
  foreign key(user_id,usage_id) references public.inventory_usages(user_id,id) on delete cascade,
  check(reason='correction' or quantity<0), check(usage_id is null or quantity=-1)
);
create index inventory_adjustment_batch on public.inventory_adjustments(user_id,batch_id);
create index inventory_adjustment_usage on public.inventory_adjustments(user_id,usage_id) where usage_id is not null;
create table public.inventory_requests (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);

do $$ declare t text; begin
  foreach t in array array['inventory_products','inventory_variants','inventory_purchases','inventory_batches','inventory_usages','inventory_adjustments','inventory_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

create function public.inventory_read(p_user_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id,'inventory'),false) then raise exception using errcode='42501',message='Inventory access denied'; end if;
  return jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by lower(t.name),t.id) from public.inventory_products t where user_id=p_user_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.label,t.id) from public.inventory_variants t where user_id=p_user_id),'[]'::jsonb),
    'purchases',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at desc,t.id) from public.inventory_purchases t where user_id=p_user_id),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at,t.id) from public.inventory_batches t where user_id=p_user_id),'[]'::jsonb),
    'usages',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at desc,t.id) from public.inventory_usages t where user_id=p_user_id),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at desc,t.id) from public.inventory_adjustments t where user_id=p_user_id),'[]'::jsonb)
  );
end $$;

create function public.inventory_mutate(p_user_id uuid,p_request_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  previous public.inventory_requests%rowtype; prod public.inventory_products%rowtype; variant public.inventory_variants%rowtype;
  batch public.inventory_batches%rowtype; usage public.inventory_usages%rowtype; purchase public.inventory_purchases%rowtype;
  result_id uuid; purchase_id uuid; variant_id uuid; item jsonb; ids uuid[] := '{}';
  quantity integer; active integer; total numeric; delta integer; purchase_date date; start_date date; end_date date; action_date date;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; result jsonb;
begin
  if p_user_id is null or not coalesce(public.finance_user_can_access_module_v1(p_user_id,'inventory'),false) then raise exception using errcode='42501',message='Inventory access denied'; end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid request'; end if;
  if p_action='link_finance' and not coalesce(public.finance_user_can_access_module_v1(p_user_id,'finance'),false) then raise exception using errcode='42501',message='Finance access denied'; end if;
  -- Serialize one owner's stock ledger, including retries with the same request key.
  perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_user_id::text,0));
  select * into previous from public.inventory_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if previous.action is distinct from p_action or previous.payload is distinct from p_payload then raise exception using errcode='40001',message='Request conflict'; end if;
    return previous.result;
  end if;

  if p_action='save_product' then
    result_id := (p_payload->>'id')::uuid;
    if result_id is null or jsonb_typeof(p_payload->'variants') is distinct from 'array'
      or jsonb_array_length(p_payload->'variants') not between 1 and 30 then raise exception using errcode='22023',message='Invalid product'; end if;
    select * into prod from public.inventory_products where user_id=p_user_id and id=result_id for update;
    if found then
      if prod.revision is distinct from (p_payload->>'revision')::integer then raise exception using errcode='40001',message='Product changed'; end if;
      if prod.unit is distinct from p_payload->>'unit' and exists(select 1 from public.inventory_batches where user_id=p_user_id and product_id=result_id) then raise exception using errcode='22023',message='Stock unit is fixed after receiving'; end if;
      update public.inventory_products set name=btrim(p_payload->>'name'),brand=nullif(btrim(p_payload->>'brand'),''),
        category=btrim(p_payload->>'category'),unit=p_payload->>'unit',item_label=btrim(p_payload->>'item_label'),revision=revision+1
        where user_id=p_user_id and id=result_id returning * into prod;
    else
      if (p_payload->>'revision')::integer is distinct from 0 then raise exception using errcode='P0002',message='Product missing'; end if;
      insert into public.inventory_products(id,user_id,name,brand,category,unit,item_label)
        values(result_id,p_user_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'brand'),''),btrim(p_payload->>'category'),p_payload->>'unit',btrim(p_payload->>'item_label')) returning * into prod;
    end if;
    for item in select value from jsonb_array_elements(p_payload->'variants') loop
      variant_id := (item->>'id')::uuid;
      if variant_id is null or variant_id=any(ids) or (prod.unit='count' and (item->>'size')::numeric is distinct from 1)
        or (prod.unit<>'count' and item->>'sheets_per_item' is not null) then raise exception using errcode='22023',message='Invalid variant'; end if;
      ids := array_append(ids,variant_id);
      if exists(select 1 from public.inventory_variants where id=variant_id and (user_id<>p_user_id or product_id<>result_id)) then raise exception using errcode='P0002',message='Variant missing'; end if;
      insert into public.inventory_variants(id,user_id,product_id,label,size,pack_quantity,sheets_per_item)
      values(variant_id,p_user_id,result_id,btrim(item->>'label'),(item->>'size')::numeric,(item->>'pack_quantity')::integer,(item->>'sheets_per_item')::integer)
      on conflict(id) do update set label=excluded.label,size=excluded.size,pack_quantity=excluded.pack_quantity,sheets_per_item=excluded.sheets_per_item;
    end loop;
    if exists(select 1 from public.inventory_variants where user_id=p_user_id and product_id=result_id and not(id=any(ids))) then raise exception using errcode='22023',message='Existing variants must be retained'; end if;

  elsif p_action='receive' then
    purchase_date := (p_payload->>'purchased_on')::date;
    if (purchase_date is not null and (purchase_date<date '1900-01-01' or purchase_date>today))
      or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 50 then raise exception using errcode='22023',message='Invalid receipt'; end if;
    insert into public.inventory_purchases(user_id,kind,purchased_on) values(p_user_id,p_payload->>'kind',purchase_date) returning id into purchase_id;
    result_id := purchase_id;
    for item in select value from jsonb_array_elements(p_payload->'lines') loop
      select * into variant from public.inventory_variants where user_id=p_user_id and id=(item->>'variant_id')::uuid;
      if not found then raise exception using errcode='P0002',message='Variant missing'; end if;
      select * into prod from public.inventory_products where user_id=p_user_id and id=variant.product_id;
      if prod.revision is distinct from (item->>'product_revision')::integer then raise exception using errcode='40001',message='Product changed'; end if;
      quantity := (item->>'quantity')::integer * variant.pack_quantity;
      active := (item->>'in_use_quantity')::integer;
      start_date := (item->>'started_on')::date;
      if active is null or active<0 or active>100 or active>quantity or (p_payload->>'kind'='purchase' and active<>0)
        or (start_date is not null and (active=0 or start_date<date '1900-01-01' or start_date>today or start_date<purchase_date))
        or (item->>'price_mode') is null or (item->>'price_mode') not in ('unit','total') then raise exception using errcode='22023',message='Invalid stock quantity'; end if;
      total := (item->>'price')::numeric;
      if total is not null and (total<0 or total<>round(total,2)) then raise exception using errcode='22023',message='Invalid price'; end if;
      if item->>'price_mode'='unit' then total := total*(item->>'quantity')::integer; end if;
      if p_payload->>'kind'='purchase' and total is null then raise exception using errcode='22023',message='Price required'; end if;
      insert into public.inventory_batches(user_id,purchase_id,product_id,variant_id,purchased_quantity,original_units,unopened_units,total_paid,snapshot)
      values(p_user_id,purchase_id,prod.id,variant.id,(item->>'quantity')::integer,quantity,quantity-active,total,
        jsonb_build_object('product_name',prod.name,'variant_label',variant.label,'unit',prod.unit,'item_label',prod.item_label,
          'size',variant.size,'pack_quantity',variant.pack_quantity,'sheets_per_item',variant.sheets_per_item)) returning * into batch;
      insert into public.inventory_usages(user_id,batch_id,started_on)
        select p_user_id,batch.id,start_date from generate_series(1,active);
    end loop;

  elsif p_action='start' then
    select * into batch from public.inventory_batches where user_id=p_user_id and id=(p_payload->>'batch_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Batch missing'; end if;
    select * into purchase from public.inventory_purchases where user_id=p_user_id and id=batch.purchase_id;
    start_date := (p_payload->>'started_on')::date;
    if batch.unopened_units<=0 then raise exception using errcode='40001',message='No unopened stock'; end if;
    if start_date is null or start_date<date '1900-01-01' or start_date>today or start_date<purchase.purchased_on then raise exception using errcode='22023',message='Invalid start date'; end if;
    update public.inventory_batches set unopened_units=unopened_units-1 where user_id=p_user_id and id=batch.id;
    insert into public.inventory_usages(user_id,batch_id,started_on) values(p_user_id,batch.id,start_date) returning id into result_id;

  elsif p_action in ('finish','edit_usage') then
    select * into usage from public.inventory_usages where user_id=p_user_id and id=(p_payload->>'usage_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Usage missing'; end if;
    if usage.revision is distinct from (p_payload->>'revision')::integer or usage.status='removed' or (p_action='finish' and usage.status<>'in_use') then raise exception using errcode='40001',message='Usage changed'; end if;
    select p.* into purchase from public.inventory_purchases p join public.inventory_batches b on b.purchase_id=p.id and b.user_id=p.user_id where b.user_id=p_user_id and b.id=usage.batch_id;
    start_date := (p_payload->>'started_on')::date; end_date := (p_payload->>'finished_on')::date;
    if (start_date is not null and (start_date<date '1900-01-01' or start_date>today or start_date<purchase.purchased_on))
      or (end_date is not null and (end_date<date '1900-01-01' or end_date>today or end_date<start_date or end_date<purchase.purchased_on))
      or ((p_action='finish' or usage.status='finished') and end_date is null)
      or (p_action='edit_usage' and usage.status='in_use' and end_date is not null) then raise exception using errcode='22023',message='Invalid usage dates'; end if;
    update public.inventory_usages set started_on=start_date,finished_on=end_date,
      status=case when p_action='finish' then 'finished' else status end,revision=revision+1 where user_id=p_user_id and id=usage.id;
    result_id := usage.id;

  elsif p_action='adjust' then
    select * into batch from public.inventory_batches where user_id=p_user_id and id=(p_payload->>'batch_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Batch missing'; end if;
    select * into purchase from public.inventory_purchases where user_id=p_user_id and id=batch.purchase_id;
    delta := (p_payload->>'quantity')::integer; action_date := (p_payload->>'adjusted_on')::date;
    if action_date is null or action_date<date '1900-01-01' or action_date>today or action_date<purchase.purchased_on then raise exception using errcode='22023',message='Invalid adjustment date'; end if;
    if p_payload->>'usage_id' is not null then
      select * into usage from public.inventory_usages where user_id=p_user_id and batch_id=batch.id and id=(p_payload->>'usage_id')::uuid for update;
      if not found then raise exception using errcode='P0002',message='Usage missing'; end if;
      if usage.status<>'in_use' then raise exception using errcode='40001',message='Usage changed'; end if;
      if action_date<usage.started_on then raise exception using errcode='22023',message='Invalid adjustment date'; end if;
      update public.inventory_usages set status='removed',revision=revision+1 where user_id=p_user_id and id=usage.id;
    else
      update public.inventory_batches set unopened_units=unopened_units+delta where user_id=p_user_id and id=batch.id;
    end if;
    insert into public.inventory_adjustments(user_id,batch_id,usage_id,quantity,reason,adjusted_on)
      values(p_user_id,batch.id,(p_payload->>'usage_id')::uuid,delta,p_payload->>'reason',action_date) returning id into result_id;

  elsif p_action='link_finance' then
    select * into purchase from public.inventory_purchases where user_id=p_user_id and id=(p_payload->>'purchase_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Purchase missing'; end if;
    if p_payload->>'finance_transaction_id' is not null then
      perform 1 from public.finance_transactions where user_id=p_user_id and id=(p_payload->>'finance_transaction_id')::uuid
        and direction='expense' and status='confirmed' and currency='MYR' for share;
      if not found then raise exception using errcode='P0002',message='Expense missing'; end if;
    end if;
    update public.inventory_purchases set finance_transaction_id=(p_payload->>'finance_transaction_id')::uuid where user_id=p_user_id and id=purchase.id;
    result_id := purchase.id;
  else raise exception using errcode='22023',message='Invalid action';
  end if;
  result := jsonb_build_object('id',result_id);
  insert into public.inventory_requests(user_id,request_id,action,payload,result) values(p_user_id,p_request_id,p_action,p_payload,result);
  return result;
end $$;

revoke all on function public.inventory_read(uuid),public.inventory_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.inventory_read(uuid),public.inventory_mutate(uuid,uuid,text,jsonb) to service_role;
