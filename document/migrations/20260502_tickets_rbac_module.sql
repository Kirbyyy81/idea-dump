insert into public.DIM_modules (modules, name)
values ('tickets', 'Tickets')
on conflict (modules) do update
set name = excluded.name;

insert into public.BRIDGE_role_modules (role_id, module_id)
select role_rows.id, module_rows.id
from public.DIM_roles role_rows
join public.DIM_modules module_rows on module_rows.modules = 'tickets'
where role_rows.role in ('owner', 'admin', 'member')
on conflict do nothing;
