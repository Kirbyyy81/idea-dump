# PRD 010: Phases 4 and 5

Repository implementation on 2026-09-06, based on merged commit 41b6c6b.

## Delivered

- Direction phrase mappings, exact canonical saved-payee matching, and bounded notes/recipient-reference extraction.
- Shared version 2 extraction and database replay: NFKC normalization, 20,000 Unicode code points, first 200 physical lines, bounded next-line searches, full-date validation, and field-length checks.
- Canonical payees must exist and be active. Merchant/payee conflicts retain the baseline. Recipient references merge into notes without duplicating the generic reference.
- Runtime traces include template ID, algorithm/version, outcome, and a value hash. Candidate payloads retain baseline fields. Hashes are internal replay metadata, not anonymized data or a public API.
- Complete bounded field observations are retained: 20 per source/field, up to 140 evaluations per candidate. Source matching loads at most 40 templates. The database enforces a 1,000-field-template runtime cap per user to match the repository query limit.
- Historical backtesting writes evidence and learning metrics without rewriting transactions, candidates, corrections, or OCR text.
- Version 1 active templates are disabled, and its unactivated templates rejected, with definitions and evidence preserved. Version 2 starts with new shadow evidence.
- Atomic contradiction-triggered disable, operator disable, and reentry into shadow with a new observation period.
- Recorded refresh outcomes, bounded reason counts, evaluated-candidate counts, an advisory lock, and a 90-second cron statement timeout. Query cancellation is handled explicitly.

Amount templates remain deferred under the PRD's evidence gate. This implementation does not establish that new amount-correction evidence justifies them.

## Promotion policy

The cron refresh generates and evaluates templates and moves eligible proposals to shadow. It does not automatically activate templates.

The operator promotion function refreshes evidence and then requires:

1. Three independent supporting confirmed transactions, zero contradictions, and perfect observed precision.
2. At least five evaluated cases when five retained cases exist. This is deliberately stricter than counting applicable cases alone.
3. Three new, independently confirmed shadow observations created after the current shadow period began.
4. Matching runtime algorithm, template version, and extracted-value hash for field observations.
5. A valid, active, user-owned source.
6. No overlap in reviewed applicability with another active template in the same field scope. This conservative gate can block redundant templates even when they agree.

Disabled versions cannot return directly to active. Requeueing refreshes evidence first and starts a fresh shadow period. Old observations cannot satisfy that period's promotion gate.

Only the trusted database operator can run promotion, disable, requeue, and refresh functions. Browser and service-role execution is revoked.

## Deployment sequence

New forward migration: supabase/migrations/20260906090624_guarded_finance_parser_learning.sql.

Initial implementation did not deploy or activate production templates. The completed cutoff rollout is recorded below.

1. Resolve the known migration ledger discrepancy by comparing stored statements and versions. Do not replay applied migrations or repair their history blindly.
2. Validate the full adopted-baseline schema and forward migrations on isolated staging. Run the SQL lifecycle test and runtime/SQL parity tests there.
3. Review query plans and refresh duration on representative staging history. The local fixture test is not a production-scale benchmark.
4. After Gate C approval, apply the migration using the versioned CLI workflow in supabase/README.md, then deploy the compatible application and OCR service.
5. Run a refresh and inspect its durable business result. A returned integer or successful cron job alone does not establish business success.
6. Collect new reviewed shadow cases and review evidence and contradictions.
7. After Gate D approval, promote only reviewed template IDs through the operator function.
8. Verify subsequent candidates, automatic disable, and baseline fallback.

Previously observed remote/local version pairs:

| Migration | Local version | Remote version |
|---|---|---|
| Observable learning | 20260901075657 | 20260901093102 |
| SQL syntax fix | 20260901093307 | 20260901093425 |
| Source learning | 20260901103000 | 20260901093435 |
| Critical fields | 20260901113000 | 20260901093453 |

These timestamp discrepancies were reconciled on 6 September 2026 after comparing the stored SQL with the repository files. All four bodies matched after line-ending and surrounding-whitespace normalization. Their stored statements were preserved; only their ledger versions were aligned with the filenames.

## Operator commands

Use a trusted database session and bind the selected UUID. Set the timeout before the calling statement.

    set statement_timeout = '90s';
    select public.finance_refresh_rule_suggestions();

    select id, status, corrections_examined, candidates_evaluated,
           templates_proposed, templates_updated, templates_shadowed,
           templates_activated, templates_disabled, templates_rejected,
           reason_counts, failure_stage, failure_code
    from public.finance_learning_runs
    order by started_at desc
    limit 10;

    select id, user_id, field_name, status, evidence_count,
           contradiction_count, evaluation_count, precision, coverage,
           shadow_started_at, status_reason
    from public.finance_parser_templates
    where algorithm_version = 2
    order by user_id, field_name, id;

Run for a reviewed UUID after the relevant approval:

    select public.finance_promote_parser_template_v2(:template_id);
    select public.finance_disable_parser_template_v2(:template_id);
    select public.finance_requeue_parser_template_v2(:template_id);

Operator disable preserves evidence and records the outcome. A false promotion or requeue result means current evidence did not qualify, or the prerequisite refresh failed. Inspect the latest learning run and template metrics.

## Verification

Use Node 22.22.0. Standard root/OCR checks are listed in AGENTS.md.

Run supabase/tests/finance_parser_learning_v2.test.sql using psql -X -v ON_ERROR_STOP=1 -f against an **isolated** database with Finance migrations applied. Synthetic data and the temporary timeout stub are wrapped in a transaction and rolled back. Never run fixture scripts on production.

From services/finance-ocr/, enable the optional parity suite against that database:

    $env:FINANCE_PARSER_TEST_DATABASE_URL = '<isolated database connection>'
    $env:FINANCE_PARSER_TEST_PSQL = '<path to psql>'
    npm test

Without these variables, the parity suite is explicitly skipped. Keep credentials out of source control and logs. The suite exercises dates, bounds, whitespace, Unicode names, direction phrases, and hashes. Database Unicode classification/collation must pass before rollout; a bare C-locale database does not match the application for non-ASCII names.

Local validation used PostgreSQL 17.10 with synthetic Finance prerequisite tables, the actual September learning migrations, and a Unicode ICU database. It exercised new tables, constraints, triggers, lifecycle, privileges, and a real statement timeout. It did not restore the entire Supabase platform or execute production cron.

Validation results: application lint, TypeScript check, 221 tests, and production build passed. OCR typecheck, build, and 180 tests passed, including 16 live PostgreSQL parity cases. The SQL lifecycle suite passed against a fresh application of the September learning migrations. The dependency audit failures recorded during initial validation were resolved in the follow-up below.

## Dependency audit follow-up

The CI audit failures were resolved by updating browserslist to 4.28.9, postcss-selector-parser to 6.1.4, Fastify to 5.12.3, and the two fast-uri dependencies to 3.1.7 and 4.1.4. Both projects now pass the full and production-only dependency audits with zero reported vulnerabilities. The CI audit checks remain enabled.

## Remaining issues

- Migration history is reconciled and the cutoff is deployed. Full Supabase staging and representative-history performance checks remain separate from the isolated tests and live smoke checks. Template activation still requires reviewed shadow evidence and operator approval.
- Production parsing accuracy and promotion eligibility require retained reviewed history and new live shadow observations.

## Upload cutoff for algorithm 2

Migration `20260906111614_finance_parser_learning_cutoff.sql` adds an opt-in cutoff per user. Apply it with the versioned CLI workflow after reconciling the existing ledger. Applying the migration alone does not reset anyone.

The requested starting point is **6 September 2026, 00:00 Malaysia time**, or `2026-09-05T16:00:00Z`. This is a fixed boundary, not a moving daily window. An upload at exactly that instant qualifies. A receipt showing an older transaction date qualifies if uploaded after the boundary; an earlier upload remains excluded even if reviewed or corrected later.

After deployment, a trusted database operator can set the selected user's boundary and refresh learning:

```sql
set statement_timeout = '90s';
select public.finance_set_parser_learning_cutoff(
  :user_id, '2026-09-06 00:00:00 Asia/Kuala_Lumpur'::timestamptz
);
select public.finance_refresh_rule_suggestions();
```

Bind `:user_id` to the verified account UUID. Check the refresh's durable run status as described above. A false cutoff result means that exact boundary was already set. The setter rejects backward, future, missing, or infinite boundaries and takes the same lock as the cron refresh. No application environment variable or new cron schedule is required.

The setting is stored in `finance_private.finance_parser_learning_settings`. It affects only algorithm 2 proposal generation and evidence replay. The legacy category/reference learners, manual rules, saved aliases, transactions, receipts, and corrections remain intact. Other users retain their own learning periods.

Setting a later boundary disables active algorithm 2 versions and rejects their proposed/shadow versions. Old definitions and evidence remain available for audit. The next refresh creates new versions from eligible uploads and starts a new shadow period. Old contradictions and old runtime traces cannot qualify or disqualify those new versions. Even the same filename pattern needs fresh reviewed observations of the new version before operator promotion.

Verify the effective boundary and current versions:

```sql
select user_id, eligible_from, updated_at
from finance_private.finance_parser_learning_settings
where user_id = :user_id;

select id, field_name, template_version, status, evidence_count,
       contradiction_count, learning_cutoff_at, shadow_started_at
from public.finance_parser_templates
where user_id = :user_id and algorithm_version = 2
  and learning_cutoff_at = finance_private.finance_parser_learning_cutoff(:user_id);
```

`candidates_evaluated` and template reason totals in subsequent refresh runs count current-period versions. `corrections_examined` still includes the legacy learner's history. Retired templates and their historical metrics may still appear in aggregate Learning UI totals; those retained records are not being replayed by algorithm 2.

Run `supabase/tests/finance_parser_learning_cutoff.test.sql` alongside the existing lifecycle suite on an isolated migrated database. The cutoff suite covers midnight inclusion, late review of old uploads, old-only proposal exclusion, fresh versions and shadow observations, legacy invocation, history preservation, user isolation, idempotency, and operator-only access. Fixtures roll back.

Validation for the cutoff: both SQL lifecycle suites passed after a fresh application of all September migrations on isolated PostgreSQL 17 with Unicode ICU collation and synthetic prerequisite tables. Application lint, type checks, 221 tests, the production build, and both dependency audits passed. This does not replace full Supabase staging or a production-scale performance check.

Production rollout completed on 6 September 2026:

- Authenticated and linked the CLI to the intended project. Compared the phase 4/5 installation with an isolated fresh application of the September migrations: all 15 function definitions, constraints, and 57 column definitions matched. Verified the helper execution restrictions, retirement of algorithm 1 templates, and the cron command as well.
- Reconciled the four reviewed timestamp pairs and recorded the already-installed `20260906090624` migration atomically, with guards against changed SQL definitions. No old migration was replayed.
- Reviewed a CLI dry run containing only `20260906111614`, then applied that migration with the versioned CLI workflow. A subsequent dry run reported no pending migrations.
- Set the selected account's cutoff to `2026-09-05T16:00:00Z` and ran learning in the same transaction, checking the durable business result before committing. Run `59d37fde-d02f-400f-93df-e7d1f669cda6` succeeded at 12:39 UTC in approximately 0.64 seconds.
- All 27 uploads from the requested day were reviewed and eligible. No source corrections were present in that period, and none of the reviewed field corrections matched an allowed proposal configuration. Consequently, the refresh created no new templates. The old shadow version was retired, and no algorithm 2 template is currently active or in shadow for this account.
- Confirmed zero earlier-upload evidence in current-period templates. Before/after counts and complete-row fingerprints matched for all 113 transactions, 131 intake items, 127 candidates, and 357 corrections in the account. No historical receipt or transaction was deleted or rewritten.
- Legacy learning still runs through the unchanged legacy function. The scheduled job remains enabled at `15 3 * * *`, which is 11:15 Malaysia time. Its historical correction totals are intentionally unaffected by the new-system cutoff.

The post-deployment security advisor reports an informational [RLS-without-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for the private settings table. This is intentional: it is operator-only, with no browser or service-role grants or policies. The scan also reports the existing payee-table notice and two unrelated warnings: [pg_net in the public schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Those were not changed by this rollout.

## Future category learning proposal, not implemented

Add category learning as a separate rule type within the guarded learning pipeline. Use reviewed category choices to learn a mapping from normalized merchant or saved payee, optionally narrowed by source and expense/income direction, to an active category owned by that user. Category assignment is a classification decision and should have its own evaluator rather than treating a category name as OCR text to extract.

Reuse explicit upload cutoffs, immutable versions, distinct-transaction support, contradiction tracking, shadow observations, operator promotion, and automatic disable. In shadow mode, record the proposed category and compare it with the user's confirmed category without changing the saved transaction. Keep manual rules ahead of learned suggestions. Measure false assignments and ambiguous merchants before choosing category-specific promotion thresholds.

Keep legacy category learning running while the new category rules are evaluated. At a later approved cutover, define one application precedence path so both learners cannot overwrite each other's category choice. This change introduces no new category rules or category-learning behavior.
