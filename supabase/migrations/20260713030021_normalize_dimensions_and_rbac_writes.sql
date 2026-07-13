-- Normalize dimension/bridge names and make multi-table RBAC writes atomic.

alter table public."DIM_roles" rename to dim_roles;
alter table public."DIM_modules" rename to dim_modules;
alter table public."BRIDGE_role_modules" rename to bridge_role_modules;
alter table public."BRIDGE_user_roles" rename to bridge_user_roles;
alter table public.app_user_module_overrides rename to bridge_user_module_overrides;
alter table public.film_cameras rename to dim_film_cameras;
alter table public.finance_categories rename to dim_finance_categories;
alter table public.finance_sources rename to dim_finance_sources;

create function public.rbac_replace_role_modules(
  p_role text,
  p_modules text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_role_id uuid;
  requested_count integer;
  resolved_count integer;
begin
  if nullif(btrim(p_role), '') is null then
    raise exception using errcode = '22023', message = 'Invalid role';
  end if;

  select id into v_role_id
  from public.dim_roles
  where role = btrim(p_role)
  for update;

  if v_role_id is null then
    raise exception using errcode = '22023', message = 'Invalid role';
  end if;

  select count(*) into requested_count
  from (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value)) requested_values;

  select count(*) into resolved_count
  from public.dim_modules modules
  where modules.modules in (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value))
    and modules.is_managed = true
    and modules.enabled = true;

  if requested_count <> resolved_count then
    raise exception using errcode = '22023', message = 'Invalid module selection';
  end if;

  delete from public.bridge_role_modules where bridge_role_modules.role_id = v_role_id;

  insert into public.bridge_role_modules (role_id, module_id)
  select v_role_id, modules.id
  from public.dim_modules modules
  where modules.modules in (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value));
end;
$function$;

create function public.rbac_create_role(
  p_role text,
  p_name text,
  p_modules text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  created_role_id uuid;
  requested_count integer;
  resolved_count integer;
begin
  if p_role is null or p_role !~ '^[a-z0-9_ -]{1,40}$' then
    raise exception using errcode = '22023', message = 'Invalid role';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = '22023', message = 'Invalid role name';
  end if;

  select count(*) into requested_count
  from (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value)) requested_values;

  select count(*) into resolved_count
  from public.dim_modules modules
  where modules.modules in (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value))
    and modules.is_managed = true
    and modules.enabled = true;

  if requested_count <> resolved_count then
    raise exception using errcode = '22023', message = 'Invalid module selection';
  end if;

  insert into public.dim_roles (role, name)
  values (p_role, left(btrim(p_name), 80))
  returning id into created_role_id;

  insert into public.bridge_role_modules (role_id, module_id)
  select created_role_id, modules.id
  from public.dim_modules modules
  where modules.modules in (select distinct value from unnest(coalesce(p_modules, array[]::text[])) as requested(value));

  return created_role_id;
end;
$function$;

create function public.rbac_save_user_access(
  p_user_id uuid,
  p_role text,
  p_overrides jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  selected_role_id uuid;
  override_row record;
  selected_module_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Invalid user';
  end if;
  if jsonb_typeof(coalesce(p_overrides, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid module overrides';
  end if;

  select id into selected_role_id
  from public.dim_roles
  where role = btrim(p_role)
  for share;
  if selected_role_id is null then
    raise exception using errcode = '22023', message = 'Invalid role';
  end if;

  insert into public.bridge_user_roles (user_id, role_id)
  values (p_user_id, selected_role_id)
  on conflict (user_id) do update set role_id = excluded.role_id;

  for override_row in select key, value from jsonb_each(coalesce(p_overrides, '{}'::jsonb))
  loop
    select id into selected_module_id
    from public.dim_modules
    where modules = override_row.key
      and is_managed = true
      and enabled = true;
    if selected_module_id is null then
      raise exception using errcode = '22023', message = 'Invalid module override';
    end if;

    if override_row.value = 'null'::jsonb then
      delete from public.bridge_user_module_overrides
      where user_id = p_user_id and module_id = selected_module_id;
    elsif override_row.value in ('"allow"'::jsonb, '"deny"'::jsonb) then
      insert into public.bridge_user_module_overrides (user_id, module_id, effect)
      values (p_user_id, selected_module_id, override_row.value #>> '{}')
      on conflict (user_id, module_id) do update set effect = excluded.effect;
    else
      raise exception using errcode = '22023', message = 'Invalid module override';
    end if;
  end loop;
end;
$function$;

revoke execute on function public.rbac_replace_role_modules(text, text[]) from public, anon, authenticated;
revoke execute on function public.rbac_create_role(text, text, text[]) from public, anon, authenticated;
revoke execute on function public.rbac_save_user_access(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rbac_replace_role_modules(text, text[]) to service_role;
grant execute on function public.rbac_create_role(text, text, text[]) to service_role;
grant execute on function public.rbac_save_user_access(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
