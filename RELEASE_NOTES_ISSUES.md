# Release 14 - Fixes and Refactoring

## Commit Message Convention

- For this task only, use `fix:`, `refactor:`, or `chore:` prefixes. Do not use `feat:` or other prefixes.
- Commit each coherent change separately, including its relevant tests. Preserve unrelated edits and do not push.

## Issue 1 - Finance route loading and error boundaries

- Status: resolved by retaining the existing behavior.
- Keep route-specific loading and error wrappers within Finance. Keep `AppShell` generic.

## Issue 2 - Remove legacy Finance redirect routes

- Status: completed.
- Removed the Sources, Categories, and Rules redirect pages. Their old URLs are no longer supported.
- Navigation uses the unified Finance settings page. Finance API endpoints remain available.

## Issue 3 - Mobile Finance header alignment

- Status: completed.
- Finance and Transactions display their title and Add transaction action in one row on standard mobile widths.
- Allow wrapping when space is insufficient, including the Transactions header at 320px. Other pages retain their existing header layouts.

## Issue 4 - Finance entry-mode parsing location

- Status: completed.
- Keep mode selection within the add page and the shared mode type in `lib/types.ts`.
- Removed the dedicated parser module and its runtime constants. Missing, invalid, or repeated mode parameters still default to screenshot entry.

## Issue 5 - Consolidate Finance reference data

- Status: completed.
- Combined the provider, hook, status type, and loading/error UI in `FinanceReferenceData.tsx`.
- Updated consumers and tests while preserving data-loading, retry, and mutation behavior.

## Issue 6 - Unnecessary settings descriptions

- Status: completed.
- Removed introductory Sources and Rules descriptions and the unused panel description option.
- Retained field instructions, record details, loading/error messages, and deletion warnings.

## Settings Navigation Decision

- Keep Sources, Categories, and Rules as tabs, showing one panel at a time.
- Retain section constants, URL parsing, and direct links to each tab.

## Validation Results

- Used Node 22.22.0 for lint, TypeScript, tests, and the production build.
- Both dependency audits passed with zero vulnerabilities.
- Lint, `tsc --noEmit`, the service-worker checks, and the production build passed.
- Focused Finance checks passed: 37 tests across 7 files. The full suite passed: 228 tests across 46 files.
- Verified headers in headless Chrome at 320, 375, 390, 768, and 1280px, plus 200% CSS zoom and keyboard focus. Standard mobile widths keep both headers on one row; the narrow Transactions layout wraps without overflow.
- Browser checks used an isolated shell fixture with the real header component, route props, compiled application CSS, and application font. Authenticated end-to-end browser flows were not exercised.
- Existing settings parsing and single-panel contract checks passed. No application references to the removed legacy page URLs remain, and the production route output excludes those pages.
- Sandbox subprocess restrictions required rerunning tests and the build with elevated execution access; those reruns passed.
