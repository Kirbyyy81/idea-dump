create or replace function public.inventory_mutate(p_user_id uuid,p_request_id uuid,p_action text,p_payload jsonb)
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
  if (p_action='link_finance' or (p_action='edit_purchase' and p_payload ? 'finance_transaction_id')) and not coalesce(public.finance_user_can_access_module_v1(p_user_id,'finance'),false) then raise exception using errcode='42501',message='Finance access denied'; end if;
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

  elsif p_action='edit_purchase' then
    select * into purchase from public.inventory_purchases where user_id=p_user_id and id=(p_payload->>'purchase_id')::uuid for update;
    if not found then raise exception using errcode='P0002',message='Purchase missing'; end if;
    if purchase.revision is distinct from (p_payload->>'revision')::integer then raise exception using errcode='40001',message='Purchase changed'; end if;
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
      or jsonb_array_length(p_payload->'lines')<>(select count(*) from public.inventory_batches b where b.user_id=p_user_id and b.purchase_id=purchase.id)
      then raise exception using errcode='22023',message='Invalid purchase edit'; end if;
    for item in select value from jsonb_array_elements(p_payload->'lines') loop
      select * into batch from public.inventory_batches b where b.user_id=p_user_id and b.purchase_id=purchase.id and b.id=(item->>'batch_id')::uuid for update;
      if not found then raise exception using errcode='P0002',message='Purchase item missing'; end if;
      if batch.id=any(ids) then raise exception using errcode='22023',message='Duplicate purchase item'; end if;
      ids := array_append(ids,batch.id);
      if (item->>'quantity') is null or (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric)
        or (item->>'quantity')::numeric not between 1 and 1000 then raise exception using errcode='22023',message='Invalid quantity'; end if;
      quantity := (item->>'quantity')::integer * (batch.snapshot->>'pack_quantity')::integer;
      delta := quantity-batch.original_units;
      if quantity not between 1 and 10000 or batch.unopened_units+delta not between 0 and 10000 then
        raise exception using errcode='22023',message='Quantity conflicts with used or adjusted stock'; end if;
      total := (item->>'total_paid')::numeric;
      if (p_payload->>'kind'='purchase' and total is null)
        or (total is not null and (total not between 0 and 1000000 or total<>round(total,2))) then raise exception using errcode='22023',message='Invalid price'; end if;
      if purchase_date is not null and (
        exists(select 1 from public.inventory_usages where user_id=p_user_id and batch_id=batch.id and (started_on<purchase_date or finished_on<purchase_date))
        or exists(select 1 from public.inventory_adjustments where user_id=p_user_id and batch_id=batch.id and adjusted_on<purchase_date)
      ) then raise exception using errcode='22023',message='Purchase date must precede stock activity'; end if;
      -- Apply only the receipt difference, retaining consumption, adjustments and historical pack sizes.
      update public.inventory_batches set purchased_quantity=(item->>'quantity')::integer,original_units=quantity,
        unopened_units=unopened_units+delta,total_paid=total where user_id=p_user_id and id=batch.id;
    end loop;
    update public.inventory_purchases set kind=p_payload->>'kind',purchased_on=purchase_date,revision=revision+1,
      finance_transaction_id=case when p_payload ? 'finance_transaction_id' then (p_payload->>'finance_transaction_id')::uuid else finance_transaction_id end where user_id=p_user_id and id=purchase.id;
    result_id := purchase.id;
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
    update public.inventory_purchases set finance_transaction_id=(p_payload->>'finance_transaction_id')::uuid,revision=revision+1 where user_id=p_user_id and id=purchase.id;
    result_id := purchase.id;
  else raise exception using errcode='22023',message='Invalid action';
  end if;
  result := jsonb_build_object('id',result_id);
  insert into public.inventory_requests(user_id,request_id,action,payload,result) values(p_user_id,p_request_id,p_action,p_payload,result);
  return result;
end $$;

revoke all on function public.inventory_read(uuid),public.inventory_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.inventory_read(uuid),public.inventory_mutate(uuid,uuid,text,jsonb) to service_role;
