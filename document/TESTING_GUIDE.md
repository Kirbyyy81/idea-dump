# IdeaDump Testing Guide

This guide explains the automated testing setup for IdeaDump: what each layer checks, how the Supabase test database is handled, how QA reports are generated, and how the same-branch autofix handoff works.

## Test Layers

The project uses four main test layers.

| Layer | Command | Purpose |
| --- | --- | --- |
| Unit tests | `npm run test` | Tests pure helpers and UI-independent logic such as RBAC, article transforms, log parsing, film validation, daily log normalization, and QA runner behavior. |
| API tests | `npm run test:api` | Tests route-handler behavior such as auth failures and API responses without driving a browser. |
| DB contract tests | `npm run test:db` | Verifies the checked-in current Supabase schema contract and important current-state drift assumptions. |
| E2E tests | `npm run test:e2e` | Runs Playwright browser tests across configured browser projects. |

The PR-level shortcut is:

```powershell
npm run qa:smoke
```

The full regression command is:

```powershell
npm run qa
```

## Supabase Test Structure

The test database follows the current Supabase database structure, not historical migrations.

Important files:

- `tests/db/schema.current.sql` is the current schema bootstrap source.
- `tests/db/seed.sql` inserts deterministic test users, roles, modules, projects, logs, and film records.
- `tests/db/schemaContract.test.ts` verifies required tables, columns, RLS state, policies, and documented current-state drift.
- `supabase/config.toml` provides local Supabase ports and auth settings for local and CI runs.

To load the local test DB:

```powershell
supabase start
.\tests\db\reset-local.ps1
```

Use a custom database URL when needed:

```powershell
.\tests\db\reset-local.ps1 -DatabaseUrl "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

When the live Supabase structure intentionally changes, refresh `tests/db/schema.current.sql`, update `tests/db/seed.sql`, and update the DB contract tests in the same change.

## QA Runner

`scripts/qa-runner.mjs` is the orchestrator. It runs the commands in order and stops at the first failure.

Smoke mode runs:

1. `npm run lint`
2. `npm run build`
3. `npm run test`
4. `npm run test:api`
5. `npm run test:db`
6. `npx playwright test --project=chromium --grep "@smoke"`

Full mode runs the same first five checks, then:

```powershell
npx playwright test
```

Every run writes:

- `qa-report/report.json` for tools and agents.
- `qa-report/summary.md` for humans.

The report includes status, branch, commit, failed command, suspected failure category, stdout/stderr summaries, and artifact paths for Playwright traces and reports.

`qa-report/`, `playwright-report/`, and `test-results/` are ignored locally and uploaded by CI on every workflow run.

## Automated Fix Handoff

The autofix flow is report-first.

When QA fails:

1. The workflow uploads the QA artifacts.
2. The autofix job downloads the artifacts.
3. `scripts/qa-autofix-guard.mjs` checks whether same-branch fixing is allowed.
4. `npm run qa:fix-context` prints `scripts/qa-agent-prompt.md` plus the latest QA summary.
5. If `QA_AGENT_COMMAND` is configured, the workflow runs that command.
6. The workflow reruns the failed command.
7. The workflow reruns `npm run test:ci`.
8. If files changed and verification passed, the workflow commits and pushes to the same branch.

The guard blocks autofix on:

- `main`
- `master`
- read-only fork pull requests
- any branch where `QA_AGENT_COMMAND` is not configured

The agent is allowed to fix broken tests, app regressions exposed by tests, stale fixtures, DB contract mismatches, Playwright selector/timing issues, and CI mistakes. It must not silently delete tests, update `schema.current.sql` without an intentional live schema change, or rewrite product behavior just to satisfy a weak test.

## GitHub Workflows

`.github/workflows/test.yml` runs on pull requests and non-main pushes. It starts local Supabase, loads the current schema and seed, installs Chromium, and runs:

```bash
npm run qa:smoke
```

`.github/workflows/nightly-tests.yml` runs on schedule and manual dispatch. It starts local Supabase, loads the current schema and seed, installs all Playwright browsers, and runs:

```bash
npm run qa
```

The nightly workflow is useful for heavier cross-browser checks that should not slow every PR. If only code-change-triggered checks are desired, the nightly workflow can be disabled without changing the local test commands.

## Local Usage

Install dependencies and browsers:

```powershell
npm install
npx playwright install chromium
```

Run the PR-level QA suite:

```powershell
npm run qa:smoke
```

Run the full QA suite:

```powershell
npx playwright install firefox webkit
npm run qa
```

Print the latest agent handoff context:

```powershell
npm run qa:fix-context
```

If `npm run build` fails with a Windows `EPERM` around `.next/trace`, check for another `next dev` or `next build` process using the same repository. Stop the stale repo-local process and rerun QA.
