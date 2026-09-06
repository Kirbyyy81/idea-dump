begin;

select plan(18);

select has_table('public', 'finance_learning_runs');
select has_table('public', 'finance_learning_run_user_summaries');
select has_table('public', 'finance_parser_templates');
select has_table('public', 'finance_template_evidence');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.finance_learning_runs'::regclass),
  'finance_learning_runs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.finance_learning_run_user_summaries'::regclass),
  'finance_learning_run_user_summaries has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.finance_parser_templates'::regclass),
  'finance_parser_templates has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.finance_template_evidence'::regclass),
  'finance_template_evidence has RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.finance_learning_runs', 'select'), 'anon cannot read learning runs');
select ok(not has_table_privilege('authenticated', 'public.finance_learning_runs', 'select'), 'authenticated cannot read learning runs');
select ok(not has_table_privilege('anon', 'public.finance_parser_templates', 'select'), 'anon cannot read parser templates');
select ok(not has_table_privilege('authenticated', 'public.finance_parser_templates', 'select'), 'authenticated cannot read parser templates');
select ok(not has_table_privilege('anon', 'public.finance_template_evidence', 'select'), 'anon cannot read template evidence');
select ok(not has_table_privilege('authenticated', 'public.finance_template_evidence', 'select'), 'authenticated cannot read template evidence');

select ok(has_table_privilege('service_role', 'public.finance_learning_runs', 'select'), 'service role can read learning runs');
select ok(has_table_privilege('service_role', 'public.finance_parser_templates', 'select'), 'service role can read parser templates');
select ok(has_table_privilege('service_role', 'public.finance_template_evidence', 'select'), 'service role can read template evidence');
select ok(
  has_function_privilege('service_role', 'public.finance_learning_summary_v1(uuid)', 'execute'),
  'service role can execute the safe summary function'
);

select * from finish();
rollback;
