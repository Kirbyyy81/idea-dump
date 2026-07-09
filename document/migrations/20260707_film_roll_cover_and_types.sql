alter table public.film_rolls
  add column if not exists film_type text not null default 'NEGATIVE',
  add column if not exists process_type text,
  add column if not exists cover_image_url text,
  add column if not exists cover_image_path text;

alter table public.film_rolls
  drop constraint if exists film_rolls_film_type_check,
  drop constraint if exists film_rolls_process_type_check,
  add constraint film_rolls_film_type_check
    check (film_type in ('NEGATIVE', 'REVERSAL', 'BW_NEGATIVE')),
  add constraint film_rolls_process_type_check
    check (process_type is null or process_type in ('C41', 'E6', 'BW', 'ECN2'));

insert into storage.buckets (id, name, public)
values ('film-covers', 'film-covers', true)
on conflict (id) do update
set public = excluded.public;
