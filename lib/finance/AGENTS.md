# Finance Domain Guide

## Scope

- Apply this guide to all code under `lib/finance/`.
- Follow the repository and `lib/AGENTS.md` guides first.

## Structure

- `lib/finance/` is the Finance feature root. Keep concise Finance capabilities at this level, including catalog, rules, review, and dashboard.
- `core/` owns Finance-wide authorization, request security, browser requests, constants, values, schemas, repository access, and cross-capability services. Do not create duplicate common layers beside a capability module.
- Use a nested directory only for a substantial Finance subsystem with several collaborating modules:
  - `transactions/` owns transaction-specific validation, persistence, ordering, idempotency, and duplicate analysis.
  - `budgets/` owns recurring budget validation, exact calculations, lifecycle services and server-only budget RPC access.
  - `ocr/` owns OCR parsing, normalization, source detection, and the OCR client.
  - `share/` owns PWA share-batch validation, upload preparation, browser handoff, and server handoff.
- Do not add a directory for a small capability merely to reproduce `schemas.ts`, `repository.ts`, and `service.ts` everywhere.
- Keep browser-only Finance code in `core/client.ts`, `catalogClient.ts`, or `share/client.ts`, each marked with `'use client'` where browser APIs are used.

## Runtime and Security

- Keep OCR parsing and normalization independent of React, browser APIs, Next.js runtime APIs, and application credentials because `services/finance-ocr/` imports them.
- Keep service-role queries in `core/repository.ts` or reviewed server-side helpers, with explicit verified-user filters.
- Preserve Finance mutation request security, idempotency, share-storage verification, and reviewed RPC workflows when moving code.

## Validation

- Run `npm run test:finance-budgets` and `npm run test:finance-budgets:browser` after budgeting changes. For SQL/lifecycle changes, also run `npm run test:finance-budgets:db` on an isolated migrated loopback database using the documented test variables in `document/FINANCE_MODULE.md`.
- Keep budgeting money as decimal strings and status comparisons exact. Budget reads and mutations reconcile expired cycles through reviewed RPCs. Never rewrite frozen cycles or bypass the Finance ledger lock.
- Store current budget settings on `finance_budgets` with typed source/category selections in `finance_budget_filters`. Keep cycle history to totals and settings snapshots, without a breakdown table. Freeze configuration snapshots on cycles; do not reintroduce configuration-version tables. For storage migrations, also run `supabase/tests/finance_budget_settings_migration.test.sql` against a disposable calendar-start baseline and `supabase/tests/finance_budget_filters_migration.test.sql` against a disposable current-settings baseline before the normal lifecycle suite.
- New weekly/monthly budgets default to Monday/the 1st in the captured time zone and can include the current period before today. Keep customization optional and preserve existing schedules and restore boundaries.

- Run `npm run test:finance-security`, `npm run test:finance-idempotency`, `npm run test:finance-ordering`, and `npm run test:finance-share` after Finance structural changes.
- When code shared with the OCR service changes, also run the Finance OCR validation from `services/finance-ocr/`.

- Parser-template normalization and extraction must agree with the versioned SQL evaluator. When changing these contracts, run the optional OCR parity suite and supabase/tests/finance_parser_learning_v2.test.sql against an isolated migrated database, following document/FINANCE_PARSER_LEARNING_ROLLOUT.md.
- Keep Node-only replay hashing separate from normalization modules imported by browser validation.
- Receipt-pattern changes must also pass `supabase/tests/finance_reviewed_receipt_patterns.test.sql` and `supabase/tests/finance_approved_receipt_rules.test.sql`. Deploy compatible application and OCR runtimes before enabling migrations that generate new template configuration types.
- Algorithm 3 non-amount changes must pass `supabase/tests/finance_parser_learning_v3.test.sql` and the paired `extendedTemplates` OCR tests. Reference transforms consume only recorded `parser_template_baseline`, never reconstructed or corrected values. Keep algorithm 2 semantics and source loading unchanged, and enforce field-template runtime limits across versions 2 and 3 together.
- Algorithm 4 is limited to filename-date context handling. Keep algorithm 2 date outcomes unchanged. Run `supabase/tests/finance_filename_date_context.test.sql` and OCR `filenameDateContext` parity tests when changing it. Field-template limits apply across versions 2, 3 and 4 together; source templates remain algorithm 2. Missing capture context must not count as support, contradiction or a fresh successful shadow review.

- Ryt receipt-format changes must pass `supabase/tests/finance_receipt_format.test.sql` and `supabase/tests/finance_receipt_finalization.test.sql`, plus OCR format/evaluator parity and worker sequence tests. Keep the specialised OCR flag default-off and preserve historical intake eligibility, raw OCR, and format-scoped learning evidence.
- When algorithms 2 and 3 coexist with receipt formats, also run `supabase/tests/finance_receipt_format_v3.test.sql`. Keep scope identity and eligibility consistent across both algorithms.
- Legacy category/direction and reference learning is retired. Screenshot runtime parsing loads manual rules and algorithms 2/3 only. Preserve historical payload fields and baselines. Changes to retirement must pass `supabase/tests/finance_legacy_retirement_upgrade.test.sql` against the predecessor schema, then current SQL suites against the retired schema.

- For duplicate evidence linking, run `tests/finance-duplicate-link.test.ts`, `tests/browser/finance-duplicate-link.spec.ts`, and `supabase/tests/finance_duplicate_link.test.sql` through the isolated companion database runner. Preserve explicit conflict choices, the per-user ledger lock, stale-version checks, notification deletion, and OCR learning boundaries.

- Notification extraction uses stored bounded definitions in `notifications/`, separate from screenshot templates. After extraction/learning changes run the notification unit suites, `tests/browser/finance-notification-patterns.spec.ts`, and the isolated companion database runner in `document/ANDROID_COMPANION.md`. The runner includes `finance_notification_learning.test.sql` plus two-connection lock/replay tests. Keep confirmation and evidence writes atomic, preserve disabled overrides and source/package ownership, invalidate changed supporting evidence, and never copy notification text into OCR learning. Categories and notes are outside notification learning.

- Notification auto-add requires valid amount/direction/merchant-or-payee/date, active ownership, current pattern evidence and a locked duplicate recheck. Category/reference are optional. Run `finance_notification_auto_confirmation.test.sql` through the companion runner plus notification Retry unit/browser tests. Keep screenshot confidence/category gates unchanged, exclude automatic results from learning, and preserve atomic raw-text deletion. Upload replays never reparse pending items.
