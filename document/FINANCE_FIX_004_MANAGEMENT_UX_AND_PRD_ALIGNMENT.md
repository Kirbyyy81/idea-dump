# Finance Fix 004: Management UX and PRD Alignment

## Summary

This fix finishes the Finance management experience and updates `PRD_007.md` to describe the v1 product that the codebase has intentionally become.

The current implementation has moved from balance-bearing accounts to lightweight sources, removed transfers, unified manual/screenshot entry under `/finance/add`, and adopted a synchronous one-screenshot/one-candidate MYR-first workflow. Those decisions should be documented rather than accidentally reversed to match an older planning draft.

The user interface also needs discoverable source and category management. Sources currently support only list/create, and the existing category page is not linked from Finance navigation.

- **Priority:** Medium
- **Recommended delivery:** After the integrity and data-contract work
- **Depends on:** Fix 001 route protection; Fix 002 currency contract for final PRD wording
- **Can proceed partly in parallel with:** Fix 003 review UI

## Problems Being Fixed

### 1. PRD and implementation use different domain language

The PRD describes financial accounts with types and possible balances. The current migration replaces `finance_accounts` with `finance_sources`, which contain a name and archive flag only.

Without an explicit update, future work may reintroduce account complexity or build against fields that no longer exist.

### 2. Several v1 decisions remain listed as open questions

The code has already chosen:

- synchronous OCR
- one candidate per screenshot
- a hard-coded `0.90` automatic-confirmation threshold
- MYR-first formatting
- an upload-date/today fallback in review when no date is parsed
- exact image duplicate rejection
- income and expense support

These should be recorded as accepted v1 behavior, not left ambiguous.

### 3. Routes in the PRD no longer match the interface

`/finance/add` is the actual entry page for manual and screenshot input. `/finance/upload` redirects to it. `/finance/accounts` does not exist because accounts were replaced by sources.

### 4. Source management is incomplete

The source API supports only `GET` and `POST`. Users can add a source inline but cannot rename, archive, or restore it through a dedicated management page.

### 5. Category management is hard to discover and only partly editable

`/finance/categories` exists and supports create/archive behavior, but it is not linked from the sidebar. The API supports more updates than the UI exposes.

### 6. Unsafe dimension changes are not clearly governed

Renaming a source/category is generally safe. Deleting a referenced source is not. Changing a category from expense to income after it has been used can make historical transaction/category direction inconsistent.

## Desired Outcome

After this fix:

- the PRD accurately describes the implemented v1 domain and routes
- sources are the official lightweight origin-of-money/payment dimension
- users can create, rename, archive, and restore sources
- users can find and manage sources and categories from Finance navigation
- category editing is supported with server-side protection for referenced type changes
- inline source/category creation remains available during add/review flows
- shared styled components are used for every form control
- no source/category management action can break historical ledger references

## Scope

### Included

- PRD decision reconciliation
- a dedicated sources route/page in the UI
- source update/archive/restore API behavior
- Finance navigation links for sources and categories
- category rename and optional color/icon editing
- safe policy for changing category type
- compatibility behavior for `/finance/upload`
- management UX/API tests

### Not included

- balances, reconciliation, statements, or account institutions
- transfers between sources
- source deletion when referenced
- exchange-rate or multi-currency user interfaces
- CSV import/export
- bank integrations

## Product Decisions to Record

Update `PRD_007.md` so these are explicit v1 decisions:

| Topic | V1 decision |
|---|---|
| Transaction directions | `expense` and `income` only. |
| Money dimension | Lightweight `finance_sources`, not balance-bearing accounts. |
| Currency | Stored explicitly with `MYR` as the only exposed/default v1 currency. |
| OCR execution | Synchronous Next.js server processing with a 60-second route budget. |
| Candidate count | One candidate per screenshot in v1. |
| Entry route | `/finance/add` combines screenshot and manual entry. |
| Legacy upload route | `/finance/upload` redirects to `/finance/add`. |
| Auto-confirm threshold | `0.90`, plus required fields, strong rule, and no duplicate assessment. |
| Exact image duplicate | Rejected with a conflict response pointing to the existing intake. |
| Missing date | Review form proposes the current date; user must confirm it. |
| Image retention | Original screenshots are not persisted by default. |
| Dashboard | Income, spending, and net cash flow are included in v1. |

Remove or rewrite open questions that these decisions answer. Keep truly future questions, such as asynchronous processing or multi-candidate support, under later phases.

## Proposed Route Structure

```txt
/finance                 monthly dashboard
/finance/add             manual or screenshot entry
/finance/upload          compatibility redirect to /finance/add
/finance/transactions    confirmed ledger management
/finance/review          pending candidate review
/finance/sources         source management
/finance/categories      category management
/finance/rules           rule and suggestion management
```

Do not add `/finance/accounts` unless the product later introduces actual account semantics.

## Likely Files to Change

- `document/PRD_007.md`
- `components/organisms/Sidebar.tsx`
- a new `app/finance/sources/page.tsx`
- `app/finance/categories/page.tsx`
- `app/api/finance/sources/route.ts`
- `app/api/finance/categories/route.ts`
- `app/finance/add/page.tsx` for link/empty-state refinements if needed
- `app/finance/review/page.tsx` for link/empty-state refinements if needed
- `lib/finance/api.ts`
- `lib/types.ts`
- an optional forward migration for source-name/archive indexing or audit fields
- navigation, API, and browser tests

## Detailed Implementation Plan

### Step 1: Update the PRD before adding new management behavior

Revise the following PRD areas:

1. Overview and goals: use "sources" consistently.
2. Module scope and routes: replace accounts with sources and add `/finance/add`.
3. Runtime ownership: state that OCR is synchronous in v1.
4. Candidate parsing: state one candidate per screenshot for v1.
5. Direction values: retain expense/income only.
6. Auto-confirmation: document the `0.90` threshold and strong-rule requirements.
7. Review: document the current-date proposal as a user-confirmed fallback.
8. Ledger/data model: replace `account_id` planning fields with `source_id`; add currency/reference from Fix 002.
9. Dashboard: confirm income is part of v1.
10. Open questions: move answered questions into a "V1 decisions" section.
11. Future phases: keep balance reconciliation, transfers, multi-currency UI, async OCR, and multiple candidates as future product decisions rather than implicit requirements.

Do not erase useful design history. A short "Implementation decisions" section can explain how the final v1 differs from the original draft.

### Step 2: Define safe source lifecycle rules

Recommended source rules:

- source names are unique per user, case-insensitively
- rename is allowed
- archive/restore is allowed
- archive hides a source from new entry and rule forms
- archived sources remain visible on historical transactions
- referenced sources cannot be permanently deleted
- creating a new source with the same name as an archived source should prompt restoration or use a deliberate distinct name

The current unique index includes archived rows, so restoration is preferable to silently creating duplicates.

### Step 3: Extend the source API

Add `PUT` or `PATCH` behavior to `app/api/finance/sources/route.ts`.

Supported updates:

- `name`
- `is_archived`

The endpoint should:

1. authorize Finance access
2. require a source ID
3. load by `id` and `user_id`
4. validate a non-empty trimmed name
5. handle case-insensitive uniqueness conflicts
6. update `updated_at`
7. return the updated source

Permanent `DELETE` should either be omitted or allowed only for an entirely unreferenced source after explicit confirmation. Archive is safer and should be the normal UI action.

Example update payload:

```json
{
  "id": "source-uuid",
  "name": "Maybank debit card",
  "is_archived": false
}
```

### Step 4: Create the Sources management page

Add `app/finance/sources/page.tsx` using existing app patterns and shared controls.

The page should provide:

- list of active sources
- separate archived section or filter
- create source form
- rename action
- archive and restore actions
- clear empty state
- explanation that sources identify where money was paid from or received into, but do not track balances

Use existing `Input`, `Button`, `Card`, `Toggle`, modal/dialog patterns, and alert context. Do not expose unstyled browser controls.

For small screens, actions must remain usable without horizontal overflow.

### Step 5: Add navigation links

Update the Finance group in `components/organisms/Sidebar.tsx`.

Recommended order:

1. Transactions
2. Review
3. Sources
4. Categories
5. Rules

The Finance dashboard remains the top-level group link.

Use existing route-active helpers so `/finance/sources` and `/finance/categories` highlight correctly. Fix 001's `/finance` route guard should automatically protect these pages.

### Step 6: Complete category editing

The category page should allow editing:

- name
- color, if the design uses category colors
- icon, if the design uses category icons
- archive/restore state

Category type requires special handling:

- allow changing type freely only before the category is referenced
- once referenced by a transaction, rule, or suggestion, keep type immutable unless a dedicated migration updates every dependent record safely
- enforce this rule in the API, not only the UI

One implementation approach:

1. when an edit includes a different type, query references across transactions, rules, and suggestions for the same user
2. if references exist, return `409` with a clear message
3. otherwise update the type

This prevents an expense transaction from pointing to a category later labeled as income.

### Step 7: Keep inline creation consistent

The add and review pages can continue creating sources/categories inline. Ensure they:

- use the same API validation as management pages
- update local option lists after creation
- never show archived dimensions in new-entry selectors
- retain archived names when displaying historical records
- provide a path to the full management pages for rename/archive operations

### Step 8: Clarify source naming and UI language

Use "Source" consistently instead of mixing source/account terminology.

Suggested help text:

> A source identifies where money was paid from or received into, such as Maybank, cash, or TNG eWallet. V1 does not calculate source balances.

Suggested examples:

- Cash
- Maybank debit card
- TNG eWallet
- GrabPay
- Salary account

### Step 9: Preserve historical display behavior

Archiving a source/category must not remove its name from existing ledger rows or dashboard joins.

Review Supabase relationship queries to ensure archived records are still returned when joined from historical transactions. Only option-list queries should filter `is_archived = false`.

### Step 10: Add optional usage counts

To help safe management, the source/category list may show transaction and active-rule counts. This is optional but useful before archive actions.

Do not load counts with one query per row. Use grouped queries or a database view/RPC if counts are implemented.

## Rollout Strategy

1. Merge the PRD update or review it in the same pull request as the UI contract.
2. Add source update API and tests.
3. Release the Sources page behind Finance access.
4. Add sidebar links to Sources and Categories.
5. Add category editing with referenced-type protection.
6. Verify inline creation and historical archived display.
7. Remove remaining account terminology from Finance UI/types/docs only after confirming it is not used by migrations that describe historical state.

Historical migration files should not be rewritten merely to rename old concepts. The later source migration already records the transition.

## Testing Plan

### Source API tests

- create, rename, archive, and restore own source
- duplicate case-insensitive name is rejected
- another user's source cannot be read or changed
- archived source is excluded from new-entry selectors
- archived source still displays on historical transactions
- referenced source cannot be permanently deleted

### Category API tests

- rename and archive/restore own category
- another user's category cannot be changed
- unused category type can change
- referenced category type change returns `409`
- archived category remains visible on historical transactions
- category direction validation still applies in transactions/rules

### Navigation/browser tests

- Finance sidebar includes Sources and Categories for an allowed user
- denied user cannot open either route
- active route styling is correct
- source/category forms use shared styled components
- create/rename/archive/restore works on desktop and narrow layouts
- inline creation immediately updates selectors

### Documentation review

- every Finance route in the PRD exists or is explicitly described as a redirect/future route
- accounts are replaced with sources in current-state sections
- historical/future account concepts remain clearly labeled
- open questions no longer include already-decided v1 behavior
- direction, currency, threshold, OCR mode, candidate count, and date fallback agree with code

## Acceptance Criteria

- [ ] `PRD_007.md` contains a clear v1 implementation-decisions section.
- [ ] Current PRD routes match the implemented route structure.
- [ ] Sources, not accounts, are the official v1 model.
- [ ] Expense/income-only, MYR-first, sync OCR, one candidate, and `0.90` threshold decisions are documented.
- [ ] `/finance/sources` supports create, rename, archive, and restore.
- [ ] Sources and Categories are linked from Finance navigation.
- [ ] Category name and optional presentation fields can be edited.
- [ ] Referenced category type cannot be changed unsafely.
- [ ] Archived dimensions are excluded from new entries but remain visible historically.
- [ ] Inline creation remains consistent with management APIs.
- [ ] All user-facing controls use shared styled components.
- [ ] API, navigation, historical-display, and responsive browser tests pass.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| PRD update erases original intent. | Add an implementation-decisions section and preserve future-scope history. |
| Source rename makes rules confusing. | Reference sources by ID and display current name; retain processing events for provenance. |
| Archive hides historical data. | Filter archives only in option lists, not relationship joins. |
| Category type edit invalidates transactions. | Enforce referenced-type immutability server-side. |
| Navigation becomes crowded. | Keep a compact Finance group and use existing nested-navigation behavior. |
| Management page duplicates inline logic. | Reuse the same APIs, validation helpers, and shared components. |

## Rollback

- Navigation links and management pages can be removed without deleting source/category data.
- API update methods can be disabled while preserving existing GET/POST behavior.
- Archive flags should not be mass-reversed during rollback.
- Do not roll the PRD back to obsolete account behavior unless the product decision itself changes.
- Any schema change must be reversed through a forward migration, not by editing an applied migration.
