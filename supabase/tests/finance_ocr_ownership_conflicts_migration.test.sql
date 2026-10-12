-- Run on a disposable predecessor database before applying the migration.
begin;
create temporary table original_ocr_functions as
select p.oid,pg_catalog.pg_get_functiondef(p.oid) as definition,p.proowner,p.proacl,p.prosecdef,p.proconfig
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'finance_finalize_screenshot_intake_v2','finance_finalize_screenshot_intake_v3','finance_complete_share_queue_item_v1'
);
\ir ../migrations/20261008020815_fix_finance_ocr_ownership_conflicts.sql
do $verify$
declare original record; current record;
begin
 if (select count(*) from original_ocr_functions)<>3 then raise exception 'Expected three OCR functions'; end if;
 for original in select * from original_ocr_functions loop
  select p.*,pg_catalog.pg_get_functiondef(p.oid) as definition into current from pg_catalog.pg_proc p where p.oid=original.oid;
  if current.definition is distinct from replace(original.definition,'''40001''','''PT409''')
   or current.proowner is distinct from original.proowner or current.proacl is distinct from original.proacl
   or current.prosecdef is distinct from original.prosecdef or current.proconfig is distinct from original.proconfig then
   raise exception 'Function body or security changed beyond the error codes';
  end if;
  if position('40001' in current.definition)>0 or position('PT409' in current.definition)=0 then
   raise exception 'Ownership conflict can still trigger a database retry';
  end if;
 end loop;
end;
$verify$;
rollback;
