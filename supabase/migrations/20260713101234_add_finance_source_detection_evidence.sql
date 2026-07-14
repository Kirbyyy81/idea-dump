alter table public.dim_finance_sources
  add column filename_aliases text[] not null default '{}'::text[],
  add column ocr_aliases text[] not null default '{}'::text[];

alter table public.dim_finance_sources
  add constraint dim_finance_sources_filename_aliases_check
    check (
      cardinality(filename_aliases) <= 20
      and array_position(filename_aliases, null) is null
      and char_length(array_to_string(filename_aliases, '')) <= 2400
    ),
  add constraint dim_finance_sources_ocr_aliases_check
    check (
      cardinality(ocr_aliases) <= 20
      and array_position(ocr_aliases, null) is null
      and char_length(array_to_string(ocr_aliases, '')) <= 2400
    );

alter table public.finance_intake_items
  add column original_filename text,
  add column detected_source_id uuid,
  add column source_detection_signals jsonb not null default '[]'::jsonb;

alter table public.finance_intake_items
  add constraint finance_intake_items_original_filename_check
    check (
      original_filename is null
      or (
        char_length(btrim(original_filename)) between 1 and 255
        and original_filename !~ '[[:cntrl:]]'
      )
    ),
  add constraint finance_intake_items_source_detection_signals_check
    check (
      jsonb_typeof(source_detection_signals) = 'array'
      and jsonb_array_length(source_detection_signals) <= 50
    ),
  add constraint finance_intake_items_detected_source_fkey
    foreign key (detected_source_id, user_id)
    references public.dim_finance_sources(id, user_id)
    on delete set null (detected_source_id);

create index finance_intake_items_detected_source_idx
  on public.finance_intake_items (detected_source_id, user_id)
  where detected_source_id is not null;

comment on column public.dim_finance_sources.filename_aliases is
  'User-managed filename phrases that may identify this source during screenshot intake.';
comment on column public.dim_finance_sources.ocr_aliases is
  'User-managed OCR phrases that may identify this source during screenshot intake.';
comment on column public.finance_intake_items.original_filename is
  'Sanitized client filename retained as source-detection evidence; screenshot bytes are not retained.';
comment on column public.finance_intake_items.source_detection_signals is
  'Bounded evidence used to select detected_source_id.';

notify pgrst, 'reload schema';
