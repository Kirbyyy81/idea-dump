-- Records the reviewed live-schema baseline without replaying that schema against
-- the production database. The restorable schema-only export is stored at:
--
--   supabase/schema.sql
--
-- SHA-256:
--   AB822079B6BDDE9E8A0995C7D75FBA9089BB592EE46F67A1DD0DC929C2E35F57
--
-- The export was produced from PostgreSQL 17.6 using pg_dump 17.10. It is an
-- external prerequisite when rebuilding from this marker; this migration is
-- intentionally a no-op so the live schema is not created a second time.

do $baseline$
declare
  missing_relations text;
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'The recorded Supabase baseline requires PostgreSQL 17 or newer';
  end if;

  select string_agg(required_name, ', ' order by required_name)
  into missing_relations
  from unnest(array[
    'BRIDGE_role_modules',
    'BRIDGE_user_roles',
    'DIM_modules',
    'DIM_roles',
    'api_keys',
    'app_user_module_overrides',
    'daily_logs',
    'film_cameras',
    'film_drive_connections',
    'film_maintenance_records',
    'film_photos',
    'film_rolls',
    'finance_candidate_transactions',
    'finance_categories',
    'finance_corrections',
    'finance_intake_items',
    'finance_processing_events',
    'finance_rule_suggestions',
    'finance_rules',
    'finance_sources',
    'finance_transactions',
    'notes',
    'projects',
    'tickets'
  ]::text[]) required_name
  where to_regclass(format('%I.%I', 'public', required_name)) is null;

  if missing_relations is not null then
    raise exception 'Live baseline is incomplete; missing relations: %', missing_relations;
  end if;

  raise notice 'Recorded live schema baseline AB822079B6BDDE9E8A0995C7D75FBA9089BB592EE46F67A1DD0DC929C2E35F57';
end;
$baseline$;
