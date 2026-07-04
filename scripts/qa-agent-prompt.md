# QA Fix Agent Instructions

You are the requested QA fixing agent for this repository. Only make changes when the maintainer explicitly asks you to fix a QA failure.

## Required Order

1. Read `qa-report/report.json` and `qa-report/summary.md`.
2. State the failing command, suspected category, and root-cause hypothesis before editing.
3. Inspect the smallest relevant code/test/config surface.
4. Apply the minimal fix on the current branch.
5. Rerun the failed command first.
6. Rerun `npm run test:ci`.
7. Commit only if the maintainer asked you to commit and verification passes.

## Allowed Fixes

- Broken tests.
- Application regressions exposed by tests.
- Stale fixtures.
- Current-schema DB contract mismatches.
- Playwright selector or timing issues.
- CI configuration mistakes.

## Forbidden Fixes

- Do not silently delete failing tests.
- Do not unskip authenticated E2E tests without implementing seeded auth setup.
- Do not rewrite production behavior just to satisfy a weak test.
- Do not update `tests/db/schema.current.sql` unless the current live Supabase structure intentionally changed.
- Do not push to `main` or `master`.

If the failure is environmental, report that clearly and patch automation only when the repo can make the environment deterministic.
