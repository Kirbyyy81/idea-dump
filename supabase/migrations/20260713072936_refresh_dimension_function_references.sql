-- PL/pgSQL bodies are parsed when invoked, so table renames do not rewrite
-- textual relation names inside their stored source. Recreate every affected
-- public function from its catalog definition with the normalized dimension
-- names while preserving signatures, attributes, ownership, and ACLs.
do $refresh_dimension_function_references$
declare
  function_row record;
  refreshed_definition text;
begin
  for function_row in
    select
      procedures.oid,
      pg_catalog.pg_get_functiondef(procedures.oid) as definition
    from pg_catalog.pg_proc procedures
    join pg_catalog.pg_namespace namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and (
        procedures.prosrc ilike '%public.finance_categories%'
        or procedures.prosrc ilike '%public.finance_sources%'
        or procedures.prosrc ilike '%public.film_cameras%'
        or procedures.prosrc ilike '%tg_table_name = ''finance_categories''%'
        or procedures.prosrc ilike '%tg_table_name = ''finance_sources''%'
      )
    order by procedures.oid
  loop
    refreshed_definition := replace(
      replace(
        replace(
          function_row.definition,
          'public.finance_categories',
          'public.dim_finance_categories'
        ),
        'public.finance_sources',
        'public.dim_finance_sources'
      ),
      'public.film_cameras',
      'public.dim_film_cameras'
    );
    refreshed_definition := replace(
      replace(
        refreshed_definition,
        'tg_table_name = ''finance_categories''',
        'tg_table_name = ''dim_finance_categories'''
      ),
      'tg_table_name = ''finance_sources''',
      'tg_table_name = ''dim_finance_sources'''
    );

    execute refreshed_definition;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc procedures
    join pg_catalog.pg_namespace namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and (
        procedures.prosrc ilike '%public.finance_categories%'
        or procedures.prosrc ilike '%public.finance_sources%'
        or procedures.prosrc ilike '%public.film_cameras%'
        or procedures.prosrc ilike '%tg_table_name = ''finance_categories''%'
        or procedures.prosrc ilike '%tg_table_name = ''finance_sources''%'
      )
  ) then
    raise exception 'Stale pre-normalization dimension references remain in public functions';
  end if;
end;
$refresh_dimension_function_references$;

notify pgrst, 'reload schema';
