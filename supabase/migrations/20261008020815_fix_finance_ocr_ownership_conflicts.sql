-- Ownership conflicts are permanent for the supplied attempt token. PostgREST
-- retries 40001 internally, so these guards must return an HTTP 409 instead.
-- Replacing only the error code preserves deployed bodies, ownership and grants.
do $migration$
declare
  target record;
  definition text;
begin
  for target in
    select * from (values
      ('public.finance_finalize_screenshot_intake_v2(uuid,uuid,uuid,text,text,numeric,text,integer,uuid,jsonb,jsonb,numeric,uuid,text,numeric,jsonb,text,uuid)', 2),
      ('public.finance_finalize_screenshot_intake_v3(uuid,uuid,uuid,text,text,numeric,text,integer,uuid,jsonb,jsonb,numeric,uuid,text,numeric,jsonb,text,uuid,jsonb)', 1),
      ('public.finance_complete_share_queue_item_v1(uuid,uuid,text,uuid,uuid,text,boolean,text,text,text)', 1)
    ) as functions(signature, expected_conflicts)
  loop
    definition := pg_catalog.pg_get_functiondef(target.signature::regprocedure);
    if pg_catalog.regexp_count(definition, '''40001''') <> target.expected_conflicts then
      raise exception 'Unexpected ownership conflict guards in %', target.signature;
    end if;
    execute pg_catalog.replace(definition, '''40001''', '''PT409''');
  end loop;
end;
$migration$;
