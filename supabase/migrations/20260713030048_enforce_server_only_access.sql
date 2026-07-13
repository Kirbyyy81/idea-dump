-- Final trust-boundary enforcement. Browser roles retain Supabase Auth access,
-- but all application tables and RPCs in public are server-only.

-- Rebuild the required non-public bucket state on a fresh project and harden
-- the existing live bucket in place.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'film-covers',
  'film-covers',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Remove all direct browser-role grants from current application objects.
revoke all privileges on all tables in schema public
  from public, anon, authenticated;

revoke all privileges on all sequences in schema public
  from public, anon, authenticated;

-- Make the trusted server contract declarative rather than relying on legacy
-- inherited ACLs from earlier Supabase defaults.
grant all privileges on all tables in schema public
  to service_role;

grant all privileges on all sequences in schema public
  to service_role;

-- Functions receive EXECUTE through PUBLIC by default. Clear every current
-- function grant, including service_role, then opt only the trusted application
-- RPCs back in. The learning refresh remains database-owner/Cron-only.
revoke execute on all functions in schema public
  from public, anon, authenticated, service_role;

grant execute on function public.finance_normalize_merchant_key(text)
  to service_role;

grant execute on function public.finance_normalize_reference_number(text)
  to service_role;

grant execute on function public.finance_begin_screenshot_intake(uuid, text)
  to service_role;

grant execute on function public.finance_confirm_candidate(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text
) to service_role;

grant execute on function public.finance_mark_candidate_duplicate(uuid, uuid, uuid)
  to service_role;

grant execute on function public.finance_reject_candidate(uuid, uuid)
  to service_role;

grant execute on function public.finance_update_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  text,
  text,
  text
) to service_role;

grant execute on function public.finance_delete_transaction(uuid, uuid)
  to service_role;

grant execute on function public.finance_accept_rule_suggestion(uuid, uuid)
  to service_role;

grant execute on function public.finance_delete_source(uuid, uuid)
  to service_role;

grant execute on function public.finance_delete_category(uuid, uuid)
  to service_role;

grant execute on function public.finance_set_category_archived(uuid, uuid, boolean)
  to service_role;

grant execute on function public.finance_set_source_archived(uuid, uuid, boolean)
  to service_role;

grant execute on function public.rbac_replace_role_modules(text, text[])
  to service_role;

grant execute on function public.rbac_create_role(text, text, text[])
  to service_role;

grant execute on function public.rbac_save_user_access(uuid, text, jsonb)
  to service_role;

-- Opt out of broad grants for objects created later by either role that owns
-- default ACLs in the live project. Table/sequence service_role grants are kept
-- because trusted server-side Data API calls depend on them. Function access is
-- opt-in even for service_role.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Hosted Supabase's supabase_admin is an internal managed role. The project
-- postgres role is not currently a member or superuser, so it cannot normally
-- rewrite that role's legacy default ACL. Guard the operation so this migration
-- remains deployable; current-object revokes above still remove today's access.
do $supabase_admin_defaults$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_admin')
     and (
       current_user = 'supabase_admin'
       or exists (
         select 1
         from pg_catalog.pg_roles
         where rolname = current_user
           and rolsuper
       )
       or pg_catalog.pg_has_role(current_user, 'supabase_admin', 'MEMBER')
     ) then
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on tables from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on sequences from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated, service_role';
  else
    raise notice 'Cannot change managed supabase_admin default ACL from role %; current-object ACLs were still revoked', current_user;
  end if;
end;
$supabase_admin_defaults$;

-- Replace mixed ownership policies and policy-free RLS with one explicit,
-- restrictive deny policy per application table. This keeps RLS as defense in
-- depth, avoids auth.uid() per-row init-plan warnings, and documents the
-- server-only classification directly in the catalog.
do $policies$
declare
  application_tables constant text[] := array[
    'bridge_role_modules',
    'bridge_user_module_overrides',
    'bridge_user_roles',
    'dim_modules',
    'dim_roles',
    'api_keys',
    'daily_logs',
    'dim_film_cameras',
    'film_drive_connections',
    'film_maintenance_records',
    'film_photos',
    'film_rolls',
    'finance_candidate_transactions',
    'dim_finance_categories',
    'finance_corrections',
    'finance_intake_items',
    'finance_processing_events',
    'finance_rule_suggestions',
    'finance_rules',
    'dim_finance_sources',
    'finance_transactions',
    'notes',
    'projects',
    'tickets'
  ];
  table_name text;
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (application_tables)
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;

  foreach table_name in array application_tables
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy server_only_deny on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      table_name
    );
  end loop;
end;
$policies$;

-- Refresh PostgREST's table/relationship/function cache after the final shape
-- and grants are installed.
notify pgrst, 'reload schema';
