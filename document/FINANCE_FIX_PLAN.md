# Finance Module Fix Plan

## Purpose

This index turns the gaps identified between `PRD_007.md` and the current Finance implementation into five focused implementation plans. The plans are ordered by operational risk: protect data first, complete the data contract second, improve review behavior third, finish the management experience fourth, and harden security and automated validation throughout.

Each plan explains:

- what problem is being fixed
- what is and is not included
- which parts of the codebase are likely to change
- the recommended implementation sequence
- roughly how the implementation should work
- database migration and deployment considerations
- required tests and acceptance criteria
- risks, rollback options, and dependencies

## Recommended Execution Order

| Order | Plan | Priority | Why it comes here |
|---|---|---|---|
| 1 | [Data Integrity and Access](./FINANCE_FIX_001_DATA_INTEGRITY_AND_ACCESS.md) | Critical | Prevents partial confirmations, duplicate ledger entries, access inconsistencies, and destructive migration behavior. |
| 2 | [OCR Data Contract](./FINANCE_FIX_002_OCR_DATA_CONTRACT.md) | High | Establishes the durable OCR, currency, and reference fields needed by later duplicate and review improvements. |
| 3 | [Duplicate and Review Flow](./FINANCE_FIX_003_DUPLICATE_AND_REVIEW_FLOW.md) | High | Builds reliable duplicate decisions and review actions on top of the completed data contract. |
| 4 | [Management UX and PRD Alignment](./FINANCE_FIX_004_MANAGEMENT_UX_AND_PRD_ALIGNMENT.md) | Medium | Completes source/category management and reconciles intentional product decisions with the written specification. |
| 5 | [Security and Testing](./FINANCE_FIX_005_SECURITY_AND_TESTING.md) | High, continuous | Defines the database access model and the automated checks required to keep every preceding change safe. |

The fifth plan should not be postponed until the end in practice. Its test layers should be added alongside Plans 1-4, followed by a final security and regression pass.

## Recommended Delivery Shape

Deliver each plan as a separate pull request or small sequence of atomic pull requests. Avoid combining schema expansion, review-flow behavior, navigation changes, and test-infrastructure work into one release. Smaller changes make database rollout, validation, and rollback substantially safer.

Suggested release sequence:

1. Deploy the integrity migration and transactional confirmation path behind the existing UI.
2. Verify production data and idempotency before removing the old multi-write confirmation code.
3. Deploy additive OCR/data-contract columns and begin dual-writing old and new fields.
4. Backfill and validate the new fields before switching reads to them.
5. Enable centralized duplicate decisions and the new review actions.
6. Release source/category management and PRD updates.
7. Enforce the chosen database access model and complete the full regression suite.

## Product Decisions Assumed by These Plans

The plans treat the following current behaviors as intentional v1 decisions unless the product owner explicitly changes them:

- transactions support `expense` and `income`; transfers are not part of the active model
- lightweight money sources replace balance-bearing financial accounts
- MYR is the default and only exposed currency in the v1 interface, while the database should still store a currency code
- screenshot OCR runs synchronously in the Next.js backend
- one screenshot creates one transaction candidate in v1
- `/finance/add` is the unified manual and screenshot entry page
- `/finance/upload` remains a compatibility redirect to `/finance/add`
- automatic confirmation uses a `0.90` confidence threshold and requires a strong rule match
- screenshots are processed in memory and are not retained by default

If any assumption changes, update the relevant plan and `PRD_007.md` before implementation begins.

## Shared Engineering Rules

All five plans should follow these rules:

- Never rewrite a database migration that has already run in a shared or production environment; add a forward migration instead.
- Prefer additive schema changes, backfills, and dual-read/dual-write transitions over destructive one-step replacements.
- Make screenshot processing and candidate confirmation idempotent.
- Keep all Finance API access authenticated, module-authorized, and scoped to the current user.
- Do not persist original screenshot bytes unless a future retention feature is explicitly approved.
- Record enough processing and correction context to explain automated decisions without storing unnecessary sensitive data.
- Use the existing styled form controls and shared components for all user-facing inputs.
- Add automated tests with each behavior change instead of relying only on a final manual test pass.

## Overall Definition of Done

The Finance remediation is complete when:

- a failed confirmation cannot leave the ledger, candidate, intake, and corrections in inconsistent states
- retrying the same confirmation cannot create a second ledger transaction
- denied users cannot open Finance pages or call Finance APIs
- dashboard summaries and recent activity use confirmed transactions only
- raw OCR, normalized OCR, OCR confidence, text hash, currency, and reference data have explicit durable fields
- duplicate decisions are deterministic, reviewable, and auditable
- review supports rejection, explicit duplicate marking, audited override, confirmation, and non-confirming retry
- sources and categories are discoverable and manageable from Finance navigation
- `PRD_007.md` accurately describes the implemented v1 product decisions
- the database access model is explicit and consistently enforced
- parser, service, API, database, RBAC, migration, and critical browser flows have automated coverage
- a clean dependency install, type-check, lint, automated test run, and production build all pass in CI
