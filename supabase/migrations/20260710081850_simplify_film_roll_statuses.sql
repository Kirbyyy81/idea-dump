update public.film_rolls
set status = case status
  when 'LOADED' then 'SHOOTING'
  when 'AWAITING_PROCESSING' then 'PROCESSING'
  when 'ARCHIVED' then 'PROCESSED'
  else status
end
where status in ('LOADED', 'AWAITING_PROCESSING', 'ARCHIVED');

alter table public.film_rolls
  drop constraint if exists film_rolls_status_check,
  add constraint film_rolls_status_check
    check (status in ('UNUSED', 'SHOOTING', 'PROCESSING', 'PROCESSED'));
