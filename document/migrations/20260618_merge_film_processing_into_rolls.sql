alter table public.film_rolls
  add column if not exists lab_name text,
  add column if not exists processing_cost numeric(10, 2) not null default 0,
  add column if not exists scanning_cost numeric(10, 2) not null default 0,
  add column if not exists shipping_cost numeric(10, 2) not null default 0,
  add column if not exists processing_date date;

do $$
begin
  if to_regclass('public.film_processing_records') is not null then
    execute $migration$
      with totals as (
        select film_roll_id,
          sum(processing_cost) as processing_cost,
          sum(scanning_cost) as scanning_cost,
          sum(shipping_cost) as shipping_cost
        from public.film_processing_records
        group by film_roll_id
      ),
      latest_lab as (
        select distinct on (film_roll_id)
          film_roll_id, lab_name
        from public.film_processing_records
        where lab_name is not null and btrim(lab_name) <> ''
        order by film_roll_id, updated_at desc, created_at desc
      ),
      latest_date as (
        select distinct on (film_roll_id)
          film_roll_id, processing_date
        from public.film_processing_records
        where processing_date is not null
        order by film_roll_id, updated_at desc, created_at desc
      )
      update public.film_rolls rolls
      set processing_cost = coalesce(totals.processing_cost, 0),
        scanning_cost = coalesce(totals.scanning_cost, 0),
        shipping_cost = coalesce(totals.shipping_cost, 0),
        lab_name = coalesce(latest_lab.lab_name, rolls.lab_name),
        processing_date = coalesce(latest_date.processing_date, rolls.processing_date),
        updated_at = now()
      from totals
      left join latest_lab on latest_lab.film_roll_id = totals.film_roll_id
      left join latest_date on latest_date.film_roll_id = totals.film_roll_id
      where rolls.id = totals.film_roll_id
    $migration$;
  end if;
end $$;

drop table if exists public.film_processing_records cascade;

alter table public.film_rolls
  drop constraint if exists film_rolls_processing_cost_check,
  drop constraint if exists film_rolls_scanning_cost_check,
  drop constraint if exists film_rolls_shipping_cost_check,
  add constraint film_rolls_processing_cost_check check (processing_cost >= 0),
  add constraint film_rolls_scanning_cost_check check (scanning_cost >= 0),
  add constraint film_rolls_shipping_cost_check check (shipping_cost >= 0);
