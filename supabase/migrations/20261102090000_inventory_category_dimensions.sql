set local lock_timeout='5s';

-- Shared inventory taxonomy. Categories and subcategories are module-wide
-- reference data, not per-user rows, so every owner picks from one list.
create table public.dim_inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dim_inventory_categories_name_key on public.dim_inventory_categories (lower(btrim(name)));
create index dim_inventory_categories_active on public.dim_inventory_categories (name) where not is_archived;

create table public.dim_inventory_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.dim_inventory_categories(id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dim_inventory_subcategories_key on public.dim_inventory_subcategories (category_id, lower(btrim(name)));
create index dim_inventory_subcategories_active on public.dim_inventory_subcategories (category_id, name) where not is_archived;

revoke all on public.dim_inventory_categories, public.dim_inventory_subcategories from public, anon, authenticated;
grant select, insert, update, delete on public.dim_inventory_categories, public.dim_inventory_subcategories to service_role;
alter table public.dim_inventory_categories enable row level security;
alter table public.dim_inventory_subcategories enable row level security;

-- Seed the taxonomy from the categories already written on products so no
-- existing shelf entry loses its filter or form options.
insert into public.dim_inventory_categories(name)
  select distinct btrim(category) from public.inventory_products where btrim(category) <> ''
  on conflict do nothing;
insert into public.dim_inventory_subcategories(category_id, name)
  select c.id, s.subcategory
  from (select distinct btrim(category) as category, btrim(subcategory) as subcategory
        from public.inventory_products where btrim(category) <> '' and btrim(subcategory) <> '') s
  join public.dim_inventory_categories c on lower(btrim(c.name)) = lower(s.category)
  on conflict do nothing;

-- Extend the read contract with the taxonomy lists used by forms and filters.
create or replace function public.inventory_read_items(p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $items$
begin
  if not coalesce(public.finance_user_can_access_module_v1(p_user_id,'inventory'),false) then
    raise exception using errcode='42501',message='Inventory access denied';
  end if;
  return jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by lower(t.name),t.id) from public.inventory_products t where user_id=p_user_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.label,t.id) from public.inventory_variants t where user_id=p_user_id),'[]'::jsonb),
    'purchases',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at,t.id) from public.inventory_purchases t where user_id=p_user_id),'[]'::jsonb),
    'usages',coalesce((select jsonb_agg(to_jsonb(t)-'user_id' order by t.created_at desc,t.id) from public.inventory_usages t where user_id=p_user_id),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'is_archived',t.is_archived) order by t.name,t.id) from public.dim_inventory_categories t),'[]'::jsonb),
    'subcategories',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'category_id',t.category_id,'name',t.name,'is_archived',t.is_archived) order by t.name,t.id) from public.dim_inventory_subcategories t),'[]'::jsonb)
  );
end;
$items$;
revoke all on function public.inventory_read_items(uuid) from public,anon,authenticated;
grant execute on function public.inventory_read_items(uuid) to service_role;

-- save_product keeps the product's text snapshot but records any new
-- category or subcategory name in the shared taxonomy (case-insensitive).
create or replace function public.inventory_ensure_taxonomy(p_category text, p_subcategory text) returns void
language plpgsql security definer set search_path='' as $taxonomy$
declare category_id uuid;
begin
  if btrim(p_category) = '' then raise exception using errcode='22023',message='Invalid category'; end if;
  insert into public.dim_inventory_categories(name) values (btrim(p_category)) on conflict do nothing;
  select id into category_id from public.dim_inventory_categories where lower(btrim(name))=lower(btrim(p_category));
  if category_id is not null and btrim(coalesce(p_subcategory,'')) <> '' then
    insert into public.dim_inventory_subcategories(category_id,name) values (category_id, btrim(p_subcategory)) on conflict do nothing;
  end if;
end;
$taxonomy$;
revoke all on function public.inventory_ensure_taxonomy(text,text) from public,anon,authenticated;
grant execute on function public.inventory_ensure_taxonomy(text,text) to service_role;

-- save_product records newly used category and subcategory names in the
-- shared taxonomy before touching the product row.
do $patch$
declare definition text; needle text; hook text;
begin
  definition := replace(pg_get_functiondef('public.inventory_mutate(uuid,uuid,text,jsonb)'::regprocedure), E'\r', '');
  needle := '  if p_action=''save_product'' then';
  hook := '  if p_action=''save_product'' then
    perform public.inventory_ensure_taxonomy(p_payload->>''category'',coalesce(p_payload->>''subcategory'',''''));';
  if position(needle in definition) = 0 then raise exception 'save_product hook point not found'; end if;
  execute replace(definition, needle, hook);
end $patch$;

-- Legacy projection keeps its previous shape; only the new contract grows.
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

notify pgrst, 'reload schema';