# Finance Fix 005: Security and Testing

## Summary

This fix makes the Finance trust boundary explicit and establishes automated coverage for the entire module. The current server routes use the Supabase service-role client, perform Finance module authorization, and scope queries by `user_id`. Most Finance tables have RLS enabled but no policies, while `finance_sources` has direct ownership policies. That mixed state should become one deliberate access model.

The repository also has no Finance-specific automated tests. A clean type-check is currently blocked locally by an incomplete dependency installation and stale generated Next.js route types. Build hygiene and CI gates are therefore part of this plan.

- **Priority:** High and continuous
- **Recommended delivery:** Security baseline early; test coverage alongside Fixes 001-004; final regression pass last
- **Depends on:** Product decision about direct Supabase access
- **Recommended decision:** Keep Finance server-only in v1

## Problems Being Fixed

### 1. Database access behavior is inconsistent

- Finance API routes use `createAdminClient()`, which bypasses RLS.
- Routes rely on module authorization plus explicit `user_id` filters.
- Original Finance tables enable RLS but define no policies, effectively blocking ordinary direct access.
- `finance_sources` defines ownership policies, implying direct access is allowed for that table.

This inconsistency makes it unclear whether direct browser-to-Supabase Finance access is supported.

### 2. Service-role mistakes have a large blast radius

The service role bypasses RLS. A missing user filter in any server query can expose or modify another user's records. Correct scoping currently depends on every route author remembering the rule.

### 3. Module denial is not represented by simple ownership policies

A policy containing only `auth.uid() = user_id` allows a signed-in user to access their own Finance data directly even if the application has denied that user the Finance module. Ownership alone is not equivalent to module authorization.

### 4. There is no Finance automated test suite

Parser, rules, OCR normalization, duplicate policy, review state transitions, migrations, RBAC, and browser flows have no dedicated regression coverage.

### 5. Local dependency/build state is stale

`package.json` and `package-lock.json` declare Tesseract packages, but the current `node_modules` tree does not contain them. Generated `.next/types` also references a removed signup route. Until the dependency tree and generated types are refreshed, type-check output is not a reliable signal.

## Recommended Access Model: Server-Only Finance

For v1, all Finance reads and writes should go through trusted Next.js API routes or server actions. Direct browser-to-Supabase access should be unsupported.

This matches the current architecture and preserves application-level Finance RBAC.

### Server-only rules

- browser code calls `/api/finance/*`, not Supabase Finance tables
- every route authenticates the session and authorizes the `finance` module
- every data operation is scoped to the authenticated user's ID
- service-role credentials remain server-only
- `anon` and `authenticated` roles receive no direct Finance table privileges
- transactional Finance functions are executable only by trusted server roles
- RLS remains enabled as a default-deny safety boundary for ordinary roles
- source policies are removed or made intentionally inert so all Finance tables follow one model

### Alternative: Module-aware direct RLS

Choose this only if a future client must query Supabase directly.

It requires a carefully reviewed database function that evaluates:

- `auth.uid()` ownership
- enabled Finance module metadata
- role-to-module assignment
- user-specific allow/deny overrides
- always-allowed behavior where applicable

Every Finance table policy would then require both ownership and module access. This is more complex and duplicates application RBAC logic, so it is not recommended for v1.

## Desired Outcome

After this fix:

- the Finance trust boundary is documented and enforced consistently
- direct ordinary-role access is either deliberately denied or fully module-aware; never mixed
- service-role queries cannot return cross-user data without failing tests/review checks
- database functions have minimal execution grants and fixed search paths
- secrets and OCR contents do not leak to clients/logs
- Finance has unit, component, API, database, migration, RBAC, and end-to-end coverage
- a clean install, type-check, lint, test run, and production build pass in CI

## Scope

### Included

- Finance database privilege/RLS consistency
- server-only repository/query patterns
- RPC/function hardening
- dependency and generated-type cleanup
- test framework and Finance test structure
- CI gates
- security, migration, and browser tests
- safe test fixtures and logging guidance

### Not included

- a general rewrite of all application RBAC
- external penetration testing
- production secret rotation unless exposure is detected
- performance/load testing beyond critical OCR/confirmation timeouts
- direct mobile Supabase access

## Likely Files to Change

- a new security/privilege migration under `document/migrations/`
- `lib/supabase/admin.ts`
- `lib/rbac/guards.ts` or Finance authorization helpers if centralization is improved
- `lib/finance/api.ts`
- Finance API route files
- `package.json`
- `package-lock.json`
- `tsconfig.json` only if test/type generation requires a justified change
- `.github/workflows/*`
- new Finance test directories/fixtures
- `README.md` or developer documentation for test commands and access model
- `document/PRD_007.md` security/runtime sections

## Detailed Implementation Plan

### Step 1: Confirm and document the trust boundary

Add a short architecture decision to the PRD or a dedicated ADR:

> Finance v1 is server-only. The browser must use authenticated, Finance-authorized Next.js endpoints. Ordinary Supabase roles cannot directly query or mutate Finance tables. The server service role bypasses RLS, so every repository operation must include authenticated-user ownership checks.

Document why simple ownership RLS is insufficient: it does not enforce application module denial.

### Step 2: Audit current grants and policies

In a safe environment, inventory:

- table privileges for `anon`, `authenticated`, and `service_role`
- RLS enabled state for every `finance_*` table
- policies on every table
- execute grants for Finance functions
- default privileges that may affect future Finance tables/functions

Include:

- `finance_sources`
- `finance_categories`
- `finance_intake_items`
- `finance_candidate_transactions`
- `finance_transactions`
- `finance_rules`
- `finance_corrections`
- `finance_processing_events`
- `finance_rule_suggestions`
- any legacy/archive table introduced by Fix 001

### Step 3: Standardize server-only database privileges

Create a forward migration that, after validation:

1. ensures RLS is enabled on every Finance table
2. revokes direct table privileges from `anon` and `authenticated`
3. revokes sequence privileges where applicable
4. removes source-only direct policies or documents why they remain inert
5. revokes public execution from Finance RPCs/functions
6. grants only the required functions to `service_role` or the chosen trusted server role
7. sets fixed search paths on security-definer functions

Rough shape:

```sql
revoke all on table public.finance_transactions from anon, authenticated;
revoke all on function public.finance_confirm_candidate(...) from public, anon, authenticated;
grant execute on function public.finance_confirm_candidate(...) to service_role;
```

The exact function signatures must be used in the migration.

Do not revoke access needed by migration or Cron execution roles. Test scheduled rule learning after privilege changes.

### Step 4: Centralize user-scoped database access

Reduce repeated, error-prone query construction in route handlers.

Recommended approach:

- keep `authorizeFinance()` as the single module authorization entry point
- introduce small Finance repository helpers that require `userId` as a non-optional parameter
- keep ownership checks close to data access
- avoid helpers that can query all users unless explicitly named and restricted for maintenance jobs

Example interface:

```ts
getFinanceTransactionForUser(userId, transactionId)
listFinanceTransactionsForUser(userId, filters)
getFinanceCandidateForUser(userId, candidateId, expectedStatus)
```

Code review rule: no Finance route may call `.from('finance_*')` without either an immediately visible user scope or a trusted transactional RPC that validates ownership internally.

### Step 5: Harden request validation and error handling

For every Finance endpoint:

- validate JSON/form-data shape
- cap string lengths for merchant, notes, names, patterns, and override reasons
- validate UUID-like identifiers before querying where useful
- reject unsupported statuses/directions/currencies
- avoid exposing raw database error messages to clients
- sanitize or safely construct PostgREST filter expressions, especially user search input
- return stable `400`, `401`, `403`, `404`, `409`, and `500` semantics
- never log screenshot bytes, full OCR text, service credentials, or raw session tokens

Consider a schema validator only if it fits repository conventions. Otherwise retain lightweight helpers with comprehensive tests.

### Step 6: Verify service-role isolation

Confirm:

- `SUPABASE_SERVICE_ROLE_KEY` is referenced only in server-side modules
- no client component imports the admin client
- the key is absent from `NEXT_PUBLIC_*` variables
- production logs do not print environment values
- API error responses do not serialize Supabase request objects

Add a lint/test check if practical to prevent importing `lib/supabase/admin` from client-marked modules.

### Step 7: Restore a clean local build baseline

Before evaluating code errors:

1. run a clean dependency install from `package-lock.json`
2. verify `tesseract.js` and `@tesseract.js-data/eng` are present
3. regenerate Next.js route types through a clean build
4. remove stale generated `.next` output only as a generated-artifact cleanup step
5. rerun type-check and build

Add scripts such as:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:finance": "vitest run ...",
    "test": "vitest run"
  }
}
```

Use the actual selected test runner and paths. Avoid a script that silently skips Finance tests.

### Step 8: Choose the test stack

Recommended stack for this Next.js/TypeScript repository:

- **Vitest** for pure TypeScript, parser, normalizer, duplicate, rule, and service tests
- **React Testing Library** for focused client-component behavior where browser E2E would be excessive
- **Playwright** for authenticated critical Finance workflows
- **Postgres/Supabase integration environment** for migrations, constraints, functions, RLS/privileges, and concurrency

If minimizing dependencies is more important, Node's built-in test runner can cover pure JavaScript, but TypeScript aliases, React components, and mocking will require additional setup. Vitest is the more practical choice here.

### Step 9: Create deterministic fixtures

Add non-sensitive synthetic fixtures for:

- Maybank-style payment screenshot OCR text
- TNG/e-wallet payment OCR text
- income/credit OCR text
- noisy OCR spacing and common recognition errors
- repeated image/text/reference duplicates
- missing merchant/date/source/category fields
- strong and possible rule matches
- cross-user records

Do not commit real bank screenshots, account numbers, references, names, or production exports.

For most tests, mock the OCR adapter and feed text directly. Keep one small synthetic image smoke test for the actual Tesseract adapter so the suite remains fast and deterministic.

### Step 10: Add unit coverage

Required pure tests:

- amount, date, merchant, direction, reference, and source parsing
- OCR normalization and hashing
- confidence calculation boundaries
- rule matching, priority ordering, and first-assignment behavior
- duplicate signal precedence and merchant/reference canonicalization
- currency validation/default behavior
- request validation helpers

Use table-driven fixtures so adding bank/e-wallet formats is easy.

### Step 11: Add database integration coverage

Required database tests:

- every migration applies in order to a clean database
- forward migrations work against a representative previous schema/data snapshot
- confirmation RPC is atomic and idempotent
- concurrent confirmation creates one transaction
- mark-duplicate transition is atomic
- uniqueness and foreign-key constraints work
- server-only grants deny `anon` and `authenticated`
- service role can perform intended operations
- Cron rule-learning function still executes with its intended role
- legacy transfer preservation/recovery behaves as planned

Run privilege tests while impersonating the relevant database roles rather than assuming grants are correct from SQL text alone.

### Step 12: Add API/RBAC coverage

For each Finance endpoint, test:

- unauthenticated request returns `401`
- authenticated but module-denied request returns `403`
- allowed request sees only the current user's data
- cross-user identifiers return `404` or a safe denial
- malformed input returns `400`
- uniqueness/duplicate conflict returns `409`
- internal failures return a generic `500` without sensitive details

Add a regression test that enumerates Finance route handlers and verifies they invoke the centralized authorization boundary.

### Step 13: Add component/browser coverage

At minimum, Playwright should cover:

1. allowed user opens Finance dashboard
2. denied user cannot open `/finance` or nested routes
3. user uploads a synthetic screenshot and receives review or confirmation outcome
4. review correction creates one transaction
5. repeated confirmation creates no duplicate
6. user marks a candidate duplicate and no transaction is created
7. user creates/edits/archives sources and categories
8. user creates and manages a manual rule
9. three matching category corrections create one narrow active learning rule
10. retry updates a pending candidate without creating a transaction
11. dashboard totals and recent list show confirmed transactions only

Mock OCR for most browser runs. Run the actual OCR smoke test separately because it is slower and more environment-sensitive.

### Step 14: Add CI gates

Recommended required checks:

1. clean dependency install
2. type-check
3. lint
4. unit/component tests
5. database migration/integration tests
6. production build
7. critical Playwright tests

Parallelize independent jobs but do not allow the production build to hide a failed type-check or test job.

Cache dependencies safely using the lockfile key. Do not cache stale `.next/types` across incompatible commits.

### Step 15: Add coverage expectations and ownership

Prioritize behavior coverage over a vanity percentage. Require tests for every listed critical state transition and security boundary.

Consider minimum coverage for pure Finance libraries, while accepting that route/UI line coverage may be less useful than integration flows.

Every future Finance bug fix should include a failing regression test first or in the same change.

## Recommended Test Matrix

| Layer | Primary target | Key risks covered |
|---|---|---|
| Unit | parser, normalizer, rules, duplicate evaluator | incorrect extraction and policy drift |
| Component | review/rule/source/category interactions | form state and action visibility |
| API | auth, validation, user scoping, status codes | unauthorized or cross-user access |
| Database | migrations, RPCs, constraints, grants | partial writes, races, privilege mistakes |
| E2E | upload-to-dashboard critical paths | broken integration across all layers |
| OCR smoke | real Tesseract adapter | dependency/runtime packaging failures |

## Rollout Strategy

1. Document the server-only decision.
2. Establish a clean local install/type-check/build baseline.
3. Add unit-test infrastructure before large Finance refactors.
4. Add database integration infrastructure with Fix 001.
5. Add API and browser coverage alongside Fixes 001-004.
6. Audit grants/policies in staging.
7. Apply the server-only privilege migration.
8. Run role-impersonation and Cron tests.
9. Make CI checks required before merging.
10. Perform the final full Finance regression run.

## Acceptance Criteria

- [ ] Finance v1's database access model is documented as server-only or explicitly module-aware.
- [ ] Ordinary Supabase roles cannot directly read or mutate Finance tables under the recommended server-only model.
- [ ] Finance RPC execution is restricted to trusted roles and uses fixed search paths.
- [ ] Every Finance API authorizes the Finance module and scopes data to the authenticated user.
- [ ] Service-role credentials cannot enter client bundles.
- [ ] Logs and errors do not expose screenshots, full OCR text, credentials, or raw database details.
- [ ] Clean install restores all declared Tesseract dependencies.
- [ ] Stale generated route types no longer affect type-checking.
- [ ] Dedicated type-check and Finance test scripts exist.
- [ ] Parser, OCR, rules, duplicates, review transitions, migrations, RBAC, and critical browser workflows have automated tests.
- [ ] Database tests prove atomicity, idempotency, role grants, and user isolation.
- [ ] CI requires install, type-check, lint, tests, database validation, build, and critical E2E checks.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Revoking direct access breaks unknown client code. | Search the repository and observe staging traffic before applying; deploy privilege changes after API coverage. |
| Service role still bypasses RLS. | Centralize scoped repository helpers and test cross-user identifiers on every endpoint. |
| Module-aware RLS duplicates RBAC incorrectly. | Prefer server-only v1; if direct access becomes required, design and test one shared database access function. |
| Tesseract makes tests slow/flaky. | Mock OCR for most tests and keep one isolated real-adapter smoke test. |
| Test setup becomes too large. | Add layers incrementally with each fix and reuse synthetic fixtures/builders. |
| Cached generated files mask failures. | Key caches by lockfile/commit inputs and regenerate Next types in CI. |

## Rollback

If privilege changes break intended server operations:

1. restore only the minimum trusted-role grants through a forward migration
2. do not grant broad access to `anon` or `authenticated` as an emergency shortcut
3. keep RLS enabled
4. use failing integration tests to identify the missing privilege

Test and CI additions should generally not be rolled back. If a flaky OCR/E2E test must be quarantined, keep the underlying unit/API/database coverage required and create a tracked issue with an owner and deadline.
