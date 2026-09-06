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

No production migration, deployment, or activation was performed during implementation.

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

These are a deployment reconciliation task, not missing implementation.

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

- Live migration ledger reconciliation, full staging verification, representative-history performance checks, and Gates C/D remain pending.
- Production parsing accuracy and promotion eligibility require retained reviewed history and new live shadow observations.
