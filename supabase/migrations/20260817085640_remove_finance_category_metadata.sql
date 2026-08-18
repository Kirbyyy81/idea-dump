set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table public.dim_finance_categories in access exclusive mode;

alter table public.dim_finance_categories
  drop constraint if exists finance_categories_text_length_check,
  drop constraint if exists finance_categories_type_check,
  drop column type,
  drop column color,
  drop column icon,
  add constraint finance_categories_text_length_check
    check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120);

drop function if exists public.finance_validate_category_direction();
drop function if exists public.finance_guard_category_type_change();

notify pgrst, 'reload schema';
