set local lock_timeout='5s';

-- Retain item identities and usage links while moving receipt details onto each item.
lock table public.inventory_products, public.inventory_variants, public.inventory_purchases,
  public.inventory_batches, public.inventory_usages in access exclusive mode;
do $complete_receipts$
begin
  if exists(select 1 from public.inventory_purchases p where not exists(
    select 1 from public.inventory_batches b where b.user_id=p.user_id and b.purchase_id=p.id)) then
    raise exception 'Every Inventory receipt must contain an item before consolidation';
  end if;
end;
$complete_receipts$;

alter table public.inventory_batches add column kind text,
  add column purchased_on date, add column currency text not null default 'MYR',
  add column finance_transaction_id uuid, add column revision integer not null default 1,
  add column receipt_created_at timestamptz not null default now();
update public.inventory_batches b set kind=p.kind,purchased_on=p.purchased_on,currency=p.currency,
  finance_transaction_id=p.finance_transaction_id,revision=p.revision,receipt_created_at=p.created_at
from public.inventory_purchases p where p.user_id=b.user_id and p.id=b.purchase_id;
alter table public.inventory_batches alter column kind set not null;
alter table public.inventory_batches drop constraint inventory_batches_user_id_purchase_id_fkey;
drop table public.inventory_purchases restrict;
alter table public.inventory_batches rename to inventory_purchases;
alter table public.inventory_purchases rename column purchase_id to receipt_id;
alter table public.inventory_usages rename column batch_id to purchase_id;

alter table public.inventory_purchases rename constraint inventory_batches_pkey to inventory_purchases_pkey;
alter table public.inventory_purchases rename constraint inventory_batches_user_id_id_key to inventory_purchases_user_id_id_key;
alter table public.inventory_purchases rename constraint inventory_batches_user_id_product_id_variant_id_fkey to inventory_purchases_user_id_product_id_variant_id_fkey;
alter table public.inventory_usages rename constraint inventory_usages_user_id_batch_id_fkey to inventory_usages_user_id_purchase_id_fkey;
alter index public.inventory_batch_purchase rename to inventory_purchase_receipt;
alter index public.inventory_batch_product rename to inventory_purchase_product;
alter table public.inventory_purchases add constraint inventory_purchase_kind check(kind in ('purchase','existing')),
  add constraint inventory_purchase_date_required check(kind='existing' or purchased_on is not null),
  add constraint inventory_purchase_currency check(currency='MYR'),
  add constraint inventory_purchase_revision check(revision>0),
  add constraint inventory_purchase_user foreign key(user_id) references auth.users(id) on delete cascade,
  add constraint inventory_purchase_finance foreign key(finance_transaction_id) references public.finance_transactions(id) on delete set null;
create index inventory_purchase_date on public.inventory_purchases(user_id,purchased_on desc);
create index inventory_purchase_finance on public.inventory_purchases(finance_transaction_id) where finance_transaction_id is not null;
revoke all on public.inventory_purchases from public,anon,authenticated;
grant select,insert,update,delete on public.inventory_purchases to service_role;

create function public.inventory_read_items(p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $items$
begin
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id,'inventory'),false) then
    raise exception using errcode='42501',message='Inventory access denied';
  end if;
  return jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by lower(t.name),t.id) from public.inventory_products t where user_id=p_user_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.label,t.id) from public.inventory_variants t where user_id=p_user_id),'[]'::jsonb),
    'purchases',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at,t.id) from public.inventory_purchases t where user_id=p_user_id),'[]'::jsonb),
    'usages',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at desc,t.id) from public.inventory_usages t where user_id=p_user_id),'[]'::jsonb)
  );
end;
$items$;
revoke all on function public.inventory_read_items(uuid) from public,anon,authenticated;
grant execute on function public.inventory_read_items(uuid) to service_role;

-- Project the previous response shape for deployed clients using the same four tables.
create or replace function public.inventory_read(p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $legacy$
declare data jsonb;
begin
  data := public.inventory_read_items(p_user_id);
  return jsonb_build_object('products',data->'products','variants',data->'variants',
    'purchases',coalesce((select jsonb_agg(jsonb_build_object('id',t.receipt_id,'kind',t.kind,'revision',t.revision,
      'purchased_on',t.purchased_on,'currency',t.currency,'finance_transaction_id',t.finance_transaction_id,'created_at',t.receipt_created_at)
      order by t.receipt_created_at desc,t.receipt_id) from (select distinct on (receipt_id) * from public.inventory_purchases where user_id=p_user_id order by receipt_id,id) t),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'purchase_id',t.receipt_id,'product_id',t.product_id,'variant_id',t.variant_id,
      'purchased_quantity',t.purchased_quantity,'original_units',t.original_units,'unopened_units',t.unopened_units,'total_paid',t.total_paid,'snapshot',t.snapshot,'created_at',t.created_at)
      order by t.created_at,t.id) from public.inventory_purchases t where user_id=p_user_id),'[]'::jsonb),
    'usages',coalesce((select jsonb_agg(to_jsonb(t)-'user_id'-'purchase_id'||jsonb_build_object('batch_id',t.purchase_id) order by t.created_at desc,t.id)
      from public.inventory_usages t where user_id=p_user_id),'[]'::jsonb),'adjustments','[]'::jsonb);
end;
$legacy$;

CREATE OR REPLACE FUNCTION public.inventory_mutate(p_user_id uuid, p_request_id uuid DEFAULT NULL, p_action text DEFAULT NULL, p_payload jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  prod public.inventory_products%rowtype; variant public.inventory_variants%rowtype;
  stock_item public.inventory_purchases%rowtype; usage public.inventory_usages%rowtype; purchase public.inventory_purchases%rowtype;
  result_id uuid; v_receipt_id uuid; variant_id uuid; item jsonb; ids uuid[] := '{}';
  quantity integer; active integer; total numeric; delta integer; purchase_date date; start_date date; end_date date;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; result jsonb;
begin
  if p_action in ('edit_purchase','link_finance') then
    p_payload := p_payload || jsonb_build_object('receipt_id',coalesce(p_payload->>'receipt_id',p_payload->>'purchase_id'));
  end if;
  if p_action='start' then
    p_payload := p_payload || jsonb_build_object('purchase_id',coalesce(p_payload->>'purchase_id',p_payload->>'batch_id'));
  elsif p_action='edit_purchase' and jsonb_typeof(p_payload->'lines')='array' then
    p_payload := p_payload || jsonb_build_object('lines',(select jsonb_agg(value || jsonb_build_object('purchase_id',coalesce(value->>'purchase_id',value->>'batch_id'))) from jsonb_array_elements(p_payload->'lines')));
  end if;
  if p_user_id is null or not coalesce(public.finance_user_can_access_module_v1(p_user_id,'inventory'),false) then raise exception using errcode='42501',message='Inventory access denied'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid request'; end if;
  if (p_action='link_finance' or (p_action='edit_purchase' and p_payload ? 'finance_transaction_id')) and not coalesce(public.finance_user_can_access_module_v1(p_user_id,'finance'),false) then raise exception using errcode='42501',message='Finance access denied'; end if;
  -- Serialize one owner's stock ledger.
  perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_user_id::text,0));

  if p_action='save_product' then
    result_id := (p_payload->>'id')::uuid;
    if result_id is null or jsonb_typeof(p_payload->'variants') is distinct from 'array'
      or jsonb_array_length(p_payload->'variants') not between 1 and 30 then raise exception using errcode='22023',message='Invalid product'; end if;
    select * into prod from public.inventory_products where user_id=p_user_id and id=result_id for update;
    if found then
      if prod.revision is distinct from (p_payload->>'revision')::integer then raise exception using errcode='40001',message='Product changed'; end if;
      if prod.unit is distinct from p_payload->>'unit' and exists(select 1 from public.inventory_purchases where user_id=p_user_id and product_id=result_id) then raise exception using errcode='22023',message='Stock unit is fixed after receiving'; end if;
      update public.inventory_products set name=btrim(p_payload->>'name'),brand=nullif(btrim(p_payload->>'brand'),''),
        subcategory=case when p_payload ? 'subcategory' then nullif(btrim(p_payload->>'subcategory'),'') when prod.category=btrim(p_payload->>'category') then prod.subcategory else null end,
        category=btrim(p_payload->>'category'),unit=p_payload->>'unit',item_label=btrim(p_payload->>'item_label'),revision=revision+1
        where user_id=p_user_id and id=result_id returning * into prod;
    else
      if (p_payload->>'revision')::integer is distinct from 0 then raise exception using errcode='P0002',message='Product missing'; end if;
      insert into public.inventory_products(id,user_id,name,brand,category,subcategory,unit,item_label)
        values(result_id,p_user_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'brand'),''),btrim(p_payload->>'category'),nullif(btrim(p_payload->>'subcategory'),''),p_payload->>'unit',btrim(p_payload->>'item_label')) returning * into prod;
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
    v_receipt_id := gen_random_uuid();
    result_id := v_receipt_id;
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
      insert into public.inventory_purchases(user_id,receipt_id,kind,purchased_on,product_id,variant_id,purchased_quantity,original_units,unopened_units,total_paid,snapshot)
      values(p_user_id,v_receipt_id,p_payload->>'kind',purchase_date,prod.id,variant.id,(item->>'quantity')::integer,quantity,quantity-active,total,
        jsonb_build_object('product_name',prod.name,'variant_label',variant.label,'unit',prod.unit,'item_label',prod.item_label,
          'size',variant.size,'pack_quantity',variant.pack_quantity,'sheets_per_item',variant.sheets_per_item)) returning * into stock_item;
      insert into public.inventory_usages(user_id,purchase_id,started_on)
        select p_user_id,stock_item.id,start_date from generate_series(1,active);
    end loop;

  elsif p_action='edit_purchase' then
    v_receipt_id := (p_payload->>'receipt_id')::uuid;
    perform 1 from public.inventory_purchases where user_id=p_user_id and receipt_id=v_receipt_id order by id for update;
    select * into purchase from public.inventory_purchases where user_id=p_user_id and receipt_id=v_receipt_id order by id limit 1;
    if not found then raise exception using errcode='P0002',message='Purchase missing'; end if;
    if exists(select 1 from public.inventory_purchases where user_id=p_user_id and receipt_id=v_receipt_id and revision is distinct from (p_payload->>'revision')::integer) then raise exception using errcode='40001',message='Purchase changed'; end if;
    if p_payload ? 'finance_transaction_id' then
      perform 1 from public.finance_transactions where user_id=p_user_id and id=(p_payload->>'finance_transaction_id')::uuid
        and direction='expense' and status='confirmed' and currency='MYR' for share;
      if not found then raise exception using errcode='P0002',message='Expense missing'; end if;
    end if;
    purchase_date := (p_payload->>'purchased_on')::date;
    if p_payload->>'kind' is null or p_payload->>'kind' not in ('purchase','existing')
      or (p_payload->>'kind'='purchase' and purchase_date is null)
      or (purchase_date is not null and (purchase_date<date '1900-01-01' or purchase_date>today))
      or jsonb_typeof(p_payload->'lines') is distinct from 'array'
      or jsonb_array_length(p_payload->'lines') not between 1 and 50
      or jsonb_array_length(p_payload->'lines')<>(select count(*) from public.inventory_purchases b where b.user_id=p_user_id and b.receipt_id=v_receipt_id)
      then raise exception using errcode='22023',message='Invalid purchase edit'; end if;
    for item in select value from jsonb_array_elements(p_payload->'lines') loop
      select * into stock_item from public.inventory_purchases b where b.user_id=p_user_id and b.receipt_id=v_receipt_id and b.id=(item->>'purchase_id')::uuid for update;
      if not found then raise exception using errcode='P0002',message='Purchase item missing'; end if;
      if stock_item.id=any(ids) then raise exception using errcode='22023',message='Duplicate purchase item'; end if;
      ids := array_append(ids,stock_item.id);
      if (item->>'quantity') is null or (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric)
        or (item->>'quantity')::numeric not between 1 and 1000 then raise exception using errcode='22023',message='Invalid quantity'; end if;
      quantity := (item->>'quantity')::integer * (stock_item.snapshot->>'pack_quantity')::integer;
      delta := quantity-stock_item.original_units;
      if quantity not between 1 and 10000 or stock_item.unopened_units+delta not between 0 and 10000 then
        raise exception using errcode='22023',message='Quantity conflicts with used stock'; end if;
      total := (item->>'total_paid')::numeric;
      if (p_payload->>'kind'='purchase' and total is null)
        or (total is not null and (total not between 0 and 1000000 or total<>round(total,2))) then raise exception using errcode='22023',message='Invalid price'; end if;
      if purchase_date is not null and (
        exists(select 1 from public.inventory_usages where user_id=p_user_id and purchase_id=stock_item.id and (started_on<purchase_date or finished_on<purchase_date))
      ) then raise exception using errcode='22023',message='Purchase date must precede stock activity'; end if;
      -- Apply only the receipt difference, retaining consumption and historical pack sizes.
      update public.inventory_purchases set purchased_quantity=(item->>'quantity')::integer,original_units=quantity,
        unopened_units=unopened_units+delta,total_paid=total where user_id=p_user_id and id=stock_item.id;
    end loop;
    update public.inventory_purchases set kind=p_payload->>'kind',purchased_on=purchase_date,revision=revision+1,
      finance_transaction_id=case when p_payload ? 'finance_transaction_id' then (p_payload->>'finance_transaction_id')::uuid else finance_transaction_id end where user_id=p_user_id and receipt_id=v_receipt_id;
    result_id := v_receipt_id;
  elsif p_action='start' then
    select * into stock_item from public.inventory_purchases where user_id=p_user_id and id=(p_payload->>'purchase_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Purchase item missing'; end if;
    purchase := stock_item;
    start_date := (p_payload->>'started_on')::date;
    if stock_item.unopened_units<=0 then raise exception using errcode='40001',message='No unopened stock'; end if;
    if start_date is null or start_date<date '1900-01-01' or start_date>today or start_date<purchase.purchased_on then raise exception using errcode='22023',message='Invalid start date'; end if;
    update public.inventory_purchases set unopened_units=unopened_units-1 where user_id=p_user_id and id=stock_item.id;
    insert into public.inventory_usages(user_id,purchase_id,started_on) values(p_user_id,stock_item.id,start_date) returning id into result_id;

  elsif p_action in ('finish','edit_usage') then
    select * into usage from public.inventory_usages where user_id=p_user_id and id=(p_payload->>'usage_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Usage missing'; end if;
    if usage.revision is distinct from (p_payload->>'revision')::integer or (p_action='finish' and usage.status<>'in_use') then raise exception using errcode='40001',message='Usage changed'; end if;
    select * into purchase from public.inventory_purchases where user_id=p_user_id and id=usage.purchase_id;
    start_date := (p_payload->>'started_on')::date; end_date := (p_payload->>'finished_on')::date;
    if (start_date is not null and (start_date<date '1900-01-01' or start_date>today or start_date<purchase.purchased_on))
      or (end_date is not null and (end_date<date '1900-01-01' or end_date>today or end_date<start_date or end_date<purchase.purchased_on))
      or ((p_action='finish' or usage.status='finished') and end_date is null)
      or (p_action='edit_usage' and usage.status='in_use' and end_date is not null) then raise exception using errcode='22023',message='Invalid usage dates'; end if;
    update public.inventory_usages set started_on=start_date,finished_on=end_date,
      status=case when p_action='finish' then 'finished' else status end,revision=revision+1 where user_id=p_user_id and id=usage.id;
    result_id := usage.id;

  elsif p_action='link_finance' then
    v_receipt_id := (p_payload->>'receipt_id')::uuid;
    perform 1 from public.inventory_purchases where user_id=p_user_id and receipt_id=v_receipt_id order by id for update;
    select * into purchase from public.inventory_purchases where user_id=p_user_id and receipt_id=v_receipt_id order by id limit 1;
    if not found then raise exception using errcode='P0002',message='Purchase missing'; end if;
    if p_payload->>'finance_transaction_id' is not null then
      perform 1 from public.finance_transactions where user_id=p_user_id and id=(p_payload->>'finance_transaction_id')::uuid
        and direction='expense' and status='confirmed' and currency='MYR' for share;
      if not found then raise exception using errcode='P0002',message='Expense missing'; end if;
    end if;
    update public.inventory_purchases set finance_transaction_id=(p_payload->>'finance_transaction_id')::uuid,revision=revision+1 where user_id=p_user_id and receipt_id=v_receipt_id;
    result_id := v_receipt_id;
  else raise exception using errcode='22023',message='Invalid action';
  end if;
  result := jsonb_build_object('id',result_id);
  return result;
end $function$;


notify pgrst, 'reload schema';
