alter table public.dim_finance_categories
  add column if not exists description text;

alter table public.dim_finance_categories
  drop constraint if exists dim_finance_categories_description_length_check,
  add constraint dim_finance_categories_description_length_check
    check (description is null or char_length(description) <= 500);
