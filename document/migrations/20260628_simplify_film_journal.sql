-- ============================================================================
-- Simplify Film Journal: Merge processing fields into film_rolls
-- Date: 2026-06-28
-- Supersedes: 20260618_merge_film_processing_into_rolls.sql (never applied)
--
-- Rationale: Each film roll has exactly one processing record, so a separate
-- table is unnecessary. Processing fields move directly into film_rolls.
--
-- Before: film_cameras, film_rolls, film_processing_records,
--         film_maintenance_records, film_photos, film_drive_connections
-- After:  film_cameras, film_rolls, film_maintenance_records,
--         film_photos, film_drive_connections
-- ============================================================================

-- Step 1: Add processing columns to film_rolls
alter table public.film_rolls
  add column if not exists lab_name text,
  add column if not exists processing_cost numeric(10, 2) not null default 0,
  add column if not exists scanning_cost numeric(10, 2) not null default 0,
  add column if not exists shipping_cost numeric(10, 2) not null default 0,
  add column if not exists processing_date date;

-- Step 2: Backfill from film_processing_records (safe even if 0 rows)
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

-- Step 3: Drop the now-redundant table (CASCADE removes its index too)
drop table if exists public.film_processing_records cascade;

-- Step 4: Enforce non-negative costs
alter table public.film_rolls
  drop constraint if exists film_rolls_processing_cost_check,
  drop constraint if exists film_rolls_scanning_cost_check,
  drop constraint if exists film_rolls_shipping_cost_check,
  add constraint film_rolls_processing_cost_check check (processing_cost >= 0),
  add constraint film_rolls_scanning_cost_check check (scanning_cost >= 0),
  add constraint film_rolls_shipping_cost_check check (shipping_cost >= 0);
