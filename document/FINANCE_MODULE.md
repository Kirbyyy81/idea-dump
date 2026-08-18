# Finance Module

## Document purpose

This document describes the Finance module as implemented in the repository on 2026-08-17. It is intended for engineers, reviewers, operators, and future maintainers who need to understand the module without reconstructing its behavior from individual pages, route handlers, migrations, and OCR service files.

The code and forward database migrations remain the source of truth. When behavior changes, update this document in the same change.

## Module scope

Finance is a personal transaction ledger with two entry paths:

1. Manual transaction entry.
2. Screenshot OCR, either as a direct upload or as a durable Android PWA share batch.

The module provides:

- Monthly cash-flow reporting.
- Expense breakdowns by category.
- A searchable and editable confirmed transaction ledger.
- A review queue for OCR candidates and duplicate decisions.
- Source, category, and parsing-rule configuration.
- Merchant and payee distinction.
- Deterministic duplicate detection.
- Correction recording and narrowly scoped rule learning.

The current product is not a bank integration, bookkeeping system, or multi-currency accounting platform. Finance v1 supports MYR only.

## System context

Finance spans three deployed runtimes and one generated PWA artifact:

```mermaid
flowchart LR
    Browser["Browser or installed PWA"]
    Next["Next.js Finance UI and APIs on Vercel"]
    Worker["Typed service worker"]
    OCR["Finance OCR service on Render"]
    Auth["Supabase Auth"]
    DB["Supabase Postgres"]
    Storage["Private Supabase Storage"]
    Queue["Supabase PGMQ queue"]

    Browser --> Next
    Browser <--> Worker
    Browser -->|"Direct screenshot with access token"| OCR
    Next --> Auth
    Next --> DB
    Next -->|"Signed share uploads"| Storage
    Next --> Queue
    OCR --> Auth
    OCR --> DB
    OCR --> Queue
    OCR --> Storage
```

### Runtime responsibilities

| Runtime | Responsibilities |
| --- | --- |
| Next.js application | Finance pages, session and module authorization, request validation, manual and review workflows, dashboard aggregation, signed share-upload preparation, queue commit, and active-batch status. |
| Finance OCR service | Image validation, Tesseract lifecycle, OCR normalization, parsing, duplicate assessment, durable queue consumption, retry handling, optional guarded auto-confirmation, and cleanup coordination. |
| Supabase | Authentication, tenant-owned Finance data, atomic mutation RPCs, correction evidence, scheduled learning, private Storage, queue state, locking, fencing, and row-level security. |
| Service worker | Receives Android PWA share-target files, keeps them temporarily until the protected Finance UI claims them, and uses the shared typed message protocol. |

## Repository structure

| Path | Ownership |
| --- | --- |
| [`app/finance/`](../app/finance/) | User-facing Finance routes and route-owned components. |
| [`app/api/finance/`](../app/api/finance/) | Thin authenticated HTTP adapters. |
| [`lib/finance/core/`](../lib/finance/core/) | Finance authorization helpers, request security, validation, browser API client, repository access, and business services. |
| [`lib/finance/transactions/`](../lib/finance/transactions/) | Duplicate assessment, URL filters, ordering, idempotency, and payee-classification behavior. |
| [`lib/finance/ocr/`](../lib/finance/ocr/) | Pure OCR normalization, source detection, parsing, reference extraction, recipient-reference handling, and learned field transforms. |
| [`lib/finance/share/`](../lib/finance/share/) | Share protocol, file validation, signed-upload client, worker messaging, and server wake behavior. |
| [`services/finance-ocr/`](../services/finance-ocr/) | Independently deployed Node.js OCR and queue-consumer service. |
| [`service-worker/sw.ts`](../service-worker/sw.ts) | Editable typed service-worker source. |
| [`public/sw.js`](../public/sw.js) | Generated service-worker deployment artifact. Do not edit directly. |
| [`supabase/migrations/`](../supabase/migrations/) | Canonical forward database migrations. |
| [`tests/`](../tests/) | Web, API, security, validation, payee, filter, idempotency, ordering, and share-flow tests. |

## User-facing routes

| Route | Purpose |
| --- | --- |
| `/finance` | Monthly dashboard, cash-flow chart, category spending chart, and recent transactions. |
| `/finance/add` | Manual transaction entry, direct screenshot upload, and accepted PWA share files. |
| `/finance/transactions` | Confirmed transaction ledger, search, filters, edit, and delete. |
| `/finance/review` | Pending OCR candidates, failed intakes, duplicate decisions, retry rules, confirmation, and rejection. |
| `/finance/settings?section=sources` | Source names, filename aliases, OCR aliases, archive, restore, and safe deletion. |
| `/finance/settings?section=categories` | Shared categories, default suggestions, archive, restore, and safe deletion. |
| `/finance/settings?section=rules` | Manual rules, learned rules, and pending learning suggestions. |

`/finance/sources`, `/finance/categories`, and `/finance/rules` are compatibility redirects to the matching Finance Settings section.

### Dashboard behavior

The dashboard accepts a `YYYY-MM` month and computes:

- Total expenses.
- Total income.
- Net cash flow.
- Number of intake items awaiting review.
- Expense totals grouped by category, including Uncategorised.
- Daily income and expense totals.
- Six most recent confirmed transactions.

The cash-flow and category panels have equal layout height. Their charts are navigation controls:

- Selecting an income bar, expense bar, or date tick opens the ledger filtered to that exact date.
- Selecting a category segment or category row opens the ledger filtered to that category.
- Selecting Uncategorised filters for transactions whose `category_id` is null.
- Chart interactions include keyboard activation and accessible labels.

Chart colors come from the dashboard presentation palette. Categories do not store color or icon metadata.

### Transaction ledger behavior

The ledger loads confirmed transactions by default and supports:

- Free-text search across merchant, payee name, transaction reference, and notes.
- Source filtering.
- Category filtering.
- Uncategorised filtering.
- Exact transaction-date filtering.
- Filter chips that show and clear URL-derived filters.
- Editing and deletion of confirmed ledger transactions.

Results are sorted by transaction date descending, creation time descending, then ID ascending. Repository reads are paginated internally so the service can return the complete matching result set without relying on the default PostgREST row limit.

## Finance access and security

### Page authorization

[`app/finance/layout.tsx`](../app/finance/layout.tsx) is the protected Finance boundary. It:

1. Loads the current authenticated user and application access.
2. Redirects signed-out users to `/login`.
3. Redirects authenticated users without Finance access to `/dashboard`.
4. Mounts the Finance share-target provider only inside the authorized Finance route tree.
5. Mounts the Finance reference-data provider at the same module boundary.

Pending, unsubmitted shared files are discarded when the user leaves the Finance layout. They are not forwarded to another module.

### Module-scoped reference data

[`FinanceReferenceDataProvider`](../app/finance/_components/FinanceReferenceDataProvider.tsx) loads the active source and category options once when the authorized Finance layout mounts. The consolidated payload contains only `id` and `name`, and the provider reuses it while the user navigates among Finance pages. Leaving Finance unmounts the provider; returning creates a fresh request.

Add, Review, Transactions, and Rules consume this shared state instead of independently loading the same option lists. Dashboard and ledger results remain page-owned and are not blocked by reference-data loading. Controls that need a source or category show a local loading or retry state. Concurrent refresh calls share one request, a failed refresh preserves the last successful options, and pending responses are aborted and ignored after unmounting.

Settings remains intentionally separate from the minimal payload. Only the active Settings section is rendered. Sources then loads aliases and archive state, Categories loads archive state, and Rules loads rules and suggestions together in one authenticated request while reusing the provider options. Successful create, rename, archive, restore, and delete operations update both the detailed Settings list and the active provider options.

### API authorization

Finance API routes do not depend on page middleware for authorization. Every handler calls `authorizeFinance()` and receives a verified user before invoking a service.

For unsafe HTTP methods, [`lib/finance/core/requestSecurity.ts`](../lib/finance/core/requestSecurity.ts) rejects:

- Requests reported by the browser as cross-site.
- Requests whose `Origin` does not match the current application origin.
- Malformed origins.
- JSON mutation routes whose content type is not `application/json`.

This guard is Finance-owned because it currently protects Finance mutation routes and has not yet been standardized as a repository-wide API policy.

### Database access

The browser does not receive direct Data API access to Finance application tables. Current Finance tables have RLS enabled, restrictive deny policies for browser roles, and direct grants revoked. Trusted server code uses the service-role or secret client only after authentication and module authorization.

Every trusted query is explicitly scoped by the verified `user_id`. Ownership is also reinforced through tenant-safe foreign keys and RPC checks. A service-role client is not treated as a substitute for tenant filtering.

### Atomic operations

Business-critical transitions use reviewed Postgres functions for:

- Manual transaction creation.
- Transaction update and deletion.
- Candidate confirmation, rejection, and duplicate marking.
- Source and category archive or deletion checks.
- Payee resolution.
- OCR intake begin, finalize, and failure.
- Share-batch preparation, commit, claim, retry, completion, and cleanup.

The functions use row locks, a per-user ledger advisory lock where required, idempotent replay behavior, and processing-attempt fencing to prevent concurrent requests from creating divergent state.

### Secret boundaries

- `SUPABASE_SERVICE_ROLE_KEY` is server-only in the Next.js runtime.
- `SUPABASE_SECRET_KEY` is server-only in the Render runtime.
- `FINANCE_QUEUE_WAKE_SECRET` is shared only between the Next.js server and Render.
- Supabase access tokens are sent to Render only to authenticate direct user OCR requests.
- No secret may use a `NEXT_PUBLIC_` prefix.

## Domain model

### Transaction

A confirmed Finance transaction contains:

| Field | Behavior |
| --- | --- |
| `user_id` | Required tenant owner. |
| `source_id` | Required user-owned source. |
| `category_id` | Optional user-owned category. The same category may be used for expense and income transactions. |
| `intake_item_id` | Optional link to screenshot lineage. Manual transactions have no intake item. |
| `manual_idempotency_key` | Present on manual entries so request retries cannot create a second ledger row. |
| `direction` | `expense` or `income`. |
| `amount` | Positive value with at most two decimals, up to `999999999999.99`. |
| `currency` | `MYR`. |
| `merchant` | Optional merchant or commercial context, maximum 500 characters. |
| `payee_id` | Optional link to the user's canonical payee catalog. |
| `reference_number` | Optional normalized transaction reference, maximum 200 characters. |
| `transaction_date` | Valid calendar date that cannot be in the future at mutation time. |
| `notes` | Optional free-form text, maximum 2,500 characters. OCR recipient references are stored here. |
| `source` | `manual` or `screenshot`. |
| `status` | The ledger normally reads `confirmed`; the shared type also describes review, duplicate, and rejected states used across Finance contracts. |

### Source

A source represents the account, card, wallet, bank, or origin of a transaction. It has:

- A user-owned canonical name.
- Up to 20 normalized filename aliases.
- Up to 20 normalized OCR-text aliases.
- An archive state.

Archived sources remain available to historical transactions. New transactions and review confirmations require an active source. Deletion is allowed only when no dependent Finance record references the source.

### Category

Categories form one user-owned library shared by expense and income transactions and rules. Category records store a name and archive state, not direction, color, or icon metadata. Food, Drinks, Transport, and Gifts are virtual shared suggestions until the user first selects or creates them.

Category names are unique per user after case-insensitive trimming. Archived categories remain available to historical transactions. A transaction may be uncategorised. Deletion is allowed only for categories with no transaction, rule, candidate, correction, or suggestion dependencies.

### Merchant and payee

Merchant and payee have different meanings:

- Merchant is the commercial context shown on a receipt or transaction.
- Payee is the person or organization that received the payment.
- A transaction may contain either field, both fields, or neither field.
- Merchant remains optional even when the transaction has a payee.

The form control is labelled `Is a payee`.

When the control is selected and the payee field is empty, an existing merchant value is moved into the payee field and merchant is cleared. When the control is cleared, the payee value is restored to merchant only if merchant is empty, then the payee field is cleared. Existing merchant and payee values are preserved when both are already populated.

When a transaction is saved with a payee name, the atomic database function:

1. Normalizes the name using the tenant-safe payee key.
2. Reuses the user's matching payee if it exists.
3. Reactivates the payee if it was archived.
4. Creates the payee if no match exists.
5. Stores the resolved `payee_id` on the transaction.

Removing a payee from a transaction does not delete the catalog entry. There is currently no standalone payee-management page.

In transaction displays, payee is the primary recipient and merchant is secondary context when both exist.

### Transaction reference and recipient reference

These values intentionally have different persistence behavior:

- A transaction reference is persisted in `reference_number`, normalized to uppercase, searched by the ledger, used by duplicate detection, and eligible for source-specific learned transforms.
- A recipient reference is recognized only during OCR parsing. Its value is conservatively cleaned and prepended to `notes`. There is no persistent `recipient_reference` column.

The migration [`20260813034905_merge_recipient_reference_into_notes.sql`](../supabase/migrations/20260813034905_merge_recipient_reference_into_notes.sql) backfilled existing recipient-reference values into Notes, updated pending candidate payloads, removed the separate field, and installed the current mutation RPC versions.

### OCR intake and candidate

An intake item stores screenshot processing lineage, including:

- User and source type.
- Original filename and image hash.
- Processing status, attempt, lease, and version.
- Raw and normalized OCR text and hashes.
- OCR confidence.
- Detected source and the evidence signals used.
- Failure code, stage, and safe error message.

A candidate stores the parsed payload, candidate confidence, matched rule, duplicate assessment, status, and optional confirmed transaction link.

The current confirmation workflow does not erase stored OCR text. Raw and normalized OCR text remain on the intake record after confirmation. A fresh retry of a failed intake clears prior OCR fields before processing again. Temporary screenshot bytes have a different lifecycle, described under Data retention and cleanup.

## Transaction validation and error handling

The manual, review, and edit workflows share Finance transaction validation from [`lib/finance/core/values.ts`](../lib/finance/core/values.ts) and server request parsers from [`lib/finance/core/schemas.ts`](../lib/finance/core/schemas.ts).

Important validation rules include:

- Source is required and must belong to the user.
- Category is optional and must belong to the user. Category selection is independent of direction.
- Direction must be expense or income.
- Amount must be positive, exact to no more than two decimal places, and within the maximum.
- Transaction date must be a real `YYYY-MM-DD` date and cannot be in the future.
- Merchant is optional and limited to 500 characters.
- Selecting `Is a payee` requires a payee name.
- A payee name cannot be sent unless `Is a payee` is selected.
- Payee name is limited to 500 characters and must contain a letter or number.
- Transaction reference is limited to 200 characters.
- Notes are limited to 2,500 characters.
- Currency must be MYR.

The browser sends `X-Finance-Time-Zone`. The server resolves today's date in that timezone for future-date validation.

Validation failures return HTTP 422 with field errors:

```json
{
  "error": "Check the highlighted fields",
  "field_errors": {
    "payee_name": "Enter the payee name",
    "amount": "Enter a positive amount with at most two decimals"
  }
}
```

The forms keep their primary action available except while saving, show a form summary and inline field messages, focus and scroll to the first invalid field, and clear a field error when that field is corrected.

HTTP 409 is reserved for state conflicts such as duplicate gates, reused idempotency keys with different content, concurrent ledger changes, stale review state, or unavailable referenced records. The typed browser client preserves the status and structured field errors, redirects expired sessions to login, and uses a 20-second default request timeout.

## Manual creation and ledger editing

### Manual creation

```mermaid
sequenceDiagram
    participant UI as Finance Add UI
    participant API as Transactions API
    participant Service as Finance service
    participant RPC as Manual transaction RPC
    participant DB as Postgres

    UI->>API: POST transaction with idempotency key
    API->>API: Authorize and validate request
    API->>Service: Create for verified user
    Service->>DB: Check existing user and idempotency key
    alt Matching replay
        DB-->>Service: Existing transaction
    else New request
        Service->>RPC: finance_create_manual_transaction_v2
        RPC->>DB: Resolve payee and insert atomically
        DB-->>Service: Created transaction
    end
    Service-->>UI: Created or recovered result
```

The same idempotency key may safely replay only when all normalized transaction details match. Reusing a key for different details returns a conflict.

### Editing

Only confirmed ledger transactions can be edited. The service merges the request with the current record, validates the resulting complete transaction, verifies source and category ownership, and calls `finance_update_transaction_v3`. Payee resolution and correction capture remain atomic with the update.

### Deletion

Deletion calls the tenant-scoped `finance_delete_transaction` RPC. Concurrent ledger mutations are serialized, and a missing transaction is reported as not found.

## Screenshot OCR

### Direct upload flow

The browser sends one multipart `screenshot` file directly to Render with the current Supabase access token.

```mermaid
sequenceDiagram
    participant UI as Finance Add UI
    participant OCR as Render OCR service
    participant Auth as Supabase Auth
    participant DB as Supabase RPCs

    UI->>OCR: POST screenshot and bearer token
    OCR->>Auth: Network-verify user token
    OCR->>DB: Verify Finance module access
    OCR->>OCR: Rate limit, capacity check, and image validation
    OCR->>DB: Begin or recover fenced intake
    OCR->>OCR: Tesseract, normalize, parse, and assess duplicate
    OCR->>DB: Finalize intake and candidate
    DB-->>UI: Review candidate or recovered terminal result
```

A newly processed direct upload always creates a review candidate. It does not auto-confirm. If the same image already has a terminal result, the service may recover that result without running OCR again.

### OCR service endpoints

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | None | Liveness check. Does not initialize Tesseract. |
| `POST /warm` | Supabase bearer token plus Finance access | Initializes or joins the shared Tesseract worker promise. |
| `POST /v1/finance/ocr` | Supabase bearer token plus Finance access | Processes one direct multipart screenshot. |
| `POST /v1/finance/queue/wake` | Server-only wake secret | Starts or joins the background share-queue drain and returns 202. |

### Image validation

The browser share flow and Render service both enforce the main image limits. Render is authoritative before OCR:

- PNG, JPEG, or WebP only.
- One direct file per request.
- Maximum 4 MB per image by default.
- Maximum dimension of 12,000 pixels per side.
- Maximum 25,000,000 total pixels.
- Declared MIME type must match magic bytes.
- Sharp must fully decode the image before Tesseract receives it.
- Filenames are normalized, stripped of control characters, and limited to 255 characters.

Render uses a single shared OCR slot to remain within its memory budget. A simultaneous direct request receives 503 with `Retry-After`. The queue claims work only after the slot is available.

### Text normalization

OCR text is normalized before parsing and hashing. The normalizer provides stable line content for:

- Field extraction.
- Rule matching.
- Source evidence.
- Exact normalized OCR-text duplicate detection.
- Review retry behavior.

The parser is pure TypeScript shared by the Next.js application and the OCR service. Review's `Retry rules` action reparses stored normalized OCR text using the user's current active sources, rules, learned reference transforms, and payees.

### Amount extraction

Amount candidates require two decimal places and may include RM, MYR, or comma separators. A candidate gains weight when its line contains terms such as amount, total, paid, payment, purchase, or transfer. Lines referring to balance, available balance, or limit are penalized so account balances are less likely to be selected as transaction amounts.

### Date extraction

The parser recognizes:

- `YYYY-MM-DD`, with slash and dot variants.
- Local day-month-year formats.
- Day plus English month name plus year.

The resulting date must form a real calendar date.

### Direction extraction

Income signals include received, credited, incoming, salary, cashback, and refund. Expense signals include paid, payment, purchase, debited, spent, merchant, and transfer-to wording. A matching rule may fill direction if it has not already been assigned by an earlier matching rule.

### Merchant and payee extraction

The parser treats the fields separately:

- `Merchant` or `Merchant name` labels populate merchant.
- `Payee`, `Recipient`, `Transfer recipient`, `Transfer to`, or `To` labels populate payee.
- One screenshot may populate both.
- Explicit merchant labeling remains merchant even if its value matches a saved payee.
- When no explicit party label is available, an exact normalized match against an active saved payee classifies that line as payee.
- Otherwise a conservative unlabeled party fallback may populate merchant.

Payee matching is exact against the normalized canonical name. There is no payee-alias learning in the current release.

### Source detection

Source aliases are normalized with NFKC, case folding, underscore replacement, punctuation removal, trimming, and whitespace collapse.

Source selection follows this order:

1. Match the source name and filename aliases against the uploaded filename.
2. If exactly one source matches the filename, select it as authoritative.
3. If multiple sources match the filename, leave source unresolved for review.
4. If the filename matches no source, match source names and OCR aliases against normalized OCR text.
5. Select an OCR-derived source only when exactly one source matches.
6. A matched rule may fill source only when existing source evidence is absent or compatible. It cannot override conflicting source evidence.

All filename, OCR, and rule evidence is stored as bounded source-detection signals on the intake item for later review and diagnosis.

### Transaction reference extraction

Reference extraction is label-aware. It recognizes qualified labels such as `Reference ID`, `Reference No`, `Ref ID`, and `Ref No`, as well as their less-specific forms.

The extractor:

- Excludes `Recipient Reference` from transaction-reference matching.
- Reads same-line values first, then up to two following non-empty lines.
- Stops at the next recognized field label.
- Accepts alphanumeric and hyphenated tokens from 5 to 200 characters that contain at least one digit.
- Prefers more-specific labels, shorter line distance, then the longer token.
- Returns null when equally ranked candidates remain ambiguous.

This ordering avoids treating copy-icon OCR artifacts as the actual transaction reference when a longer valid identifier is adjacent to the label.

### Recipient-reference extraction

The parser recognizes `Recipient Reference`, `Recipient Ref`, and qualified ID or number variants. It supports a value on the label line or within the next two lines, stopping at another recognized field.

Cleanup is deliberately conservative. It removes a small set of known leading copy-icon artifacts and ignores literal `Copy` or `Copied`, but preserves the remaining free-form text. The value is then prepended to Notes, separated from existing notes by one newline and never duplicated when the same line already exists.

### Rule matching

Active rules are evaluated deterministically by:

1. Lower numeric priority first.
2. Match type: exact phrase, merchant alias, keyword, then account hint.
3. Manual rules before learned rules.
4. Creation time.
5. Rule ID.

For each output field, the first matching assignment wins. A rule can assign source, category, direction, or merchant behavior depending on its configuration. Category-producing rules are preferred as the candidate's primary matched rule because guarded auto-confirmation requires a valid category rule.

Manual merchant-alias rules use merchant substring matching. Auto-created merchant rules require an exact normalized merchant match and must remain compatible with the inferred source and direction.

### Confidence calculation

Candidate confidence is additive and capped at 1.0:

| Evidence | Weight |
| --- | ---: |
| Amount | 0.35 |
| Transaction date | 0.20 |
| Merchant or payee | 0.15 |
| Direction | 0.10 |
| Source | 0.10 |
| Category | 0.05 |
| Matched rule | 0.05 |

Confidence is one auto-confirmation gate, not a probability guarantee.

## Duplicate detection

Duplicate detection compares a candidate only with the verified user's confirmed transactions. Currency must match. Missing values reduce certainty and never act as wildcards.

| Score | Outcome | Signals |
| ---: | --- | --- |
| 100 | Strong | Same normalized transaction reference and source. |
| 95 | Strong | Same normalized OCR-text hash. |
| 90 | Strong | Same amount, date, source, and normalized merchant. |
| 70 | Possible | Same amount, date, and normalized merchant. |
| 60 | Possible | Same amount and normalized merchant within one day. |
| 40 | Possible | Same amount and date. |

The best candidate is selected by score, then most recent transaction date, then stable transaction ID ordering.

Payee and recipient-reference text are intentionally excluded from existing strong duplicate semantics. Payee does not substitute for merchant, and recipient-reference text in Notes is not a duplicate key.

The application assessment is advisory. The confirmation RPC recomputes the duplicate result from committed rows under the per-user ledger lock using the final reviewed values.

- Any possible or strong match requires the user to explicitly allow the duplicate before manual confirmation.
- A strong match also requires an override reason.
- Automatic confirmation never overrides a duplicate.
- The user may instead mark the candidate as a duplicate of the matched confirmed transaction, which does not create a ledger row.

## Review workflow

The review queue shows pending candidates and failed intakes. A pending candidate supports:

- Editing all transaction fields.
- Creating a source while reviewing.
- Creating a category while reviewing.
- Re-running current parsing and rules against the stored normalized OCR text.
- Confirming into the ledger.
- Marking it as a duplicate.
- Rejecting it.

Confirmation uses `finance_confirm_candidate_v3`. In one database transaction it:

1. Locks candidate and intake state.
2. Supports safe replay of an already accepted candidate.
3. Validates active tenant-owned source and category records.
4. Recomputes duplicate status under the ledger lock.
5. Enforces manual or automatic duplicate policy.
6. Creates the confirmed screenshot transaction.
7. Resolves or creates the payee.
8. Records changed fields as correction evidence.
9. Links candidate to transaction.
10. Moves the intake to completed.
11. Records processing events.

Rejecting and marking duplicate are also atomic candidate and intake state transitions.

## Correction recording and learned rules

Review confirmation records differences between the original candidate and the confirmed values. Current correction evidence includes source, category, direction, amount, merchant, transaction date, currency, transaction reference, payee name, and notes. The context excerpt is limited to the first 1,000 characters of normalized or fallback OCR text.

Transaction edits also record payee-name changes. Corrections store the text payee name, not the opaque payee ID.

### Category learning

The database schedules `finance_refresh_rule_suggestions()` daily at 03:15 database time. For category learning, it considers the latest correction for each confirmed transaction and groups evidence by:

- User.
- Exact normalized merchant.
- Direction.
- Source.
- Confirmed category.

After at least three distinct supporting transactions and no competing category for the same key, the refresh creates or maintains a narrow learned merchant-alias rule. Unsupported generated rules are paused. Manual compatible rules take precedence over generating redundant learned rules.

The Settings UI also supports pending `finance_rule_suggestions`: users can edit, activate, or dismiss them. Accepted suggestions become learning rules. Learned rules can be paused or resumed, but their core learned fields cannot be edited and they cannot be permanently deleted through the normal rule API.

### Reference-number learning

Reference learning is source-specific and supports four deterministic transforms:

- Strip a repeated prefix.
- Strip a repeated suffix.
- Keep digits only.
- Keep alphanumeric characters only.

A transform becomes eligible only after at least three distinct corrected transactions and zero contradictory reviewed outcomes. During parsing, eligible active rules are ordered by evidence count, transform rank, creation time, and ID. At most one transform is applied. The transformed result must differ from the original and remain between 5 and 200 characters.

Learning currently changes category selection and transaction-reference cleanup. It does not learn arbitrary payee aliases, notes transformations, date formats, or merchant-to-payee reclassification.

## Automatic confirmation

Direct screenshot uploads never auto-confirm newly processed candidates.

A queued Android share item may auto-confirm only when all of the following are true:

- Candidate status is pending.
- Candidate confidence is at least 0.90.
- A matched rule exists.
- Duplicate outcome is none.
- Source, category, direction, amount, and transaction date are present.
- The confirmation RPC verifies that the matched rule is active, user-owned, consistent with the candidate's selected category and direction, and a strong `exact_phrase` or `merchant_alias` rule.
- The database's final duplicate recheck still returns none.

If any gate fails, the result goes to Finance Review.

## Android PWA share flow

The share target is supported by the installed Android PWA. iPhone and iPad users use the Finance screenshot upload because the project does not include a native iOS Share Extension.

```mermaid
sequenceDiagram
    participant Android as Android share sheet
    participant SW as Service worker
    participant UI as Protected Finance UI
    participant API as Next.js share APIs
    participant Storage as Private Storage
    participant Queue as PGMQ
    participant OCR as Render queue consumer

    Android->>SW: Share up to 10 images
    SW->>UI: Typed claim and payload messages
    UI->>API: Prepare batch metadata
    API-->>UI: Signed upload tokens
    UI->>Storage: Upload validated images
    UI->>API: Commit verified batch
    API->>Queue: Enqueue one item per image
    API->>OCR: Best-effort wake request
    API-->>UI: 202 safe_to_close
    OCR->>Queue: Claim after OCR slot is available
    OCR->>Storage: Download authoritative private object
    OCR->>OCR: Validate and process
    OCR->>Queue: Commit terminal result
    OCR->>Storage: Delete and verify temporary objects
```

### Browser-side share limits

- Maximum 10 files.
- Maximum 4 MB per file.
- Maximum 40 MB per batch.
- PNG, JPEG, and WebP only.
- MIME signature and image dimensions are validated before upload.

The service worker and Finance UI communicate through the shared protocol in [`lib/finance/share/protocol.ts`](../lib/finance/share/protocol.ts). Message types cover ready, claim, payload, acknowledgement, missing payload, and error. Runtime parsers reject malformed messages.

### Durable batch behavior

- Preparing a batch reserves tenant-owned private Storage paths and signed upload tokens.
- Committing verifies uploaded objects before creating durable queue work.
- Commit returns HTTP 202 with `safe_to_close: true`. The user may leave after this response.
- One active batch is exposed to the user at a time. A newer accepted batch replaces earlier active transient batch state according to the database contract.
- Each queue item has a processing lease and fenced attempt ID.
- A recoverable first failure can retry immediately. The maximum is two attempts.
- Exact image duplicates skip OCR.
- Terminal item states are auto-confirmed, review required, duplicate, or failed.
- When all items are terminal, Render deletes and verifies the temporary Storage objects before removing transient batch state.
- Failed cleanup remains recoverable on a later queue wake.

The share wake request is an optimization. Durable queue and database state remain authoritative if the wake call fails or the Render service restarts.

## Data states

### Intake state

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> processing
    processing --> review
    processing --> completed
    processing --> duplicate
    processing --> failed
    review --> completed
    review --> duplicate
    review --> rejected
    failed --> processing: eligible retry
```

### Candidate state

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> accepted
    pending --> duplicate
    pending --> rejected
```

### Share item state

Share batch items move from queued to processing and then to one terminal state: auto-confirmed, review required, duplicate, or failed. Batch state moves through queued, processing, and cleaning up before transient batch records are removed.

## Database model

### Public Finance tables

| Table | Purpose |
| --- | --- |
| `dim_finance_sources` | User-owned transaction sources and OCR aliases. |
| `dim_finance_categories` | Shared user-owned categories with normalized name uniqueness and archive state. |
| `dim_finance_payees` | Canonical user-owned payees with normalized uniqueness and archive state. |
| `finance_transactions` | Confirmed ledger rows and manual or screenshot lineage. |
| `finance_intake_items` | OCR intake lifecycle, hashes, text, source evidence, leases, and failures. |
| `finance_candidate_transactions` | Parsed review candidates, confidence, rules, and duplicate assessment. |
| `finance_rules` | Manual and learned matching rules. |
| `finance_rule_suggestions` | Pending, accepted, and rejected learning suggestions. |
| `finance_field_learning_rules` | Source-specific deterministic reference transforms. |
| `finance_corrections` | Original and corrected field values tied to review or transaction lineage. |
| `finance_processing_events` | Safe processing and state-transition audit events. |

### Private transient tables

The `finance_private` schema owns share upload reservations, reservation items, batches, and batch items. They are server-only and are removed after verified terminal cleanup. PGMQ owns the `finance_share_ocr` durable queue.

### Important integrity rules

- Canonical source, category, and payee names are tenant-safe.
- Payees have one normalized name per user.
- Source and category relationships use user-aware ownership constraints.
- A screenshot intake can produce at most one candidate and one confirmed transaction.
- A manual idempotency key is unique per user when present.
- Reference, date, source, category, payee, and OCR-hash access paths are indexed for their workflows.
- Candidate payloads and transaction text fields have database constraints matching application limits.
- Current transaction mutation RPCs are `finance_create_manual_transaction_v2`, `finance_confirm_candidate_v3`, and `finance_update_transaction_v3`.

## Next.js API surface

All Finance API handlers are dynamic and return JSON.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/finance/dashboard` | GET | Monthly totals, chart data, and six minimal recent-transaction summaries. |
| `/api/finance/reference-data` | GET | Active source and category options with only `id` and `name`. |
| `/api/finance/transactions` | GET, POST, PUT, DELETE | Ledger read, manual create, edit, and delete. |
| `/api/finance/review` | GET, POST | Review queue plus confirm, retry, duplicate, and reject actions. |
| `/api/finance/sources` | GET, POST, PATCH or PUT, DELETE | Source library management. |
| `/api/finance/categories` | GET, POST, PUT or PATCH, DELETE | Category library management. |
| `/api/finance/rules` | GET, POST, PUT, DELETE | Rule library management. GET also returns pending suggestions so Settings needs one read. |
| `/api/finance/rule-suggestions` | PATCH, POST | Edit, activate, or dismiss learning suggestions. |
| `/api/finance/share-batches/prepare` | POST | Reserve a batch and return signed upload details. |
| `/api/finance/share-batches/commit` | POST | Verify uploads, queue them, and return 202. |
| `/api/finance/share-batches/active` | GET | Return the verified user's current active transient batch. |
| `/api/finance/upload` | POST | Retired. Returns 410 because direct OCR is handled by Render. |

### Browser payload policy

- Browser responses expose view contracts instead of database rows. Tenant IDs, persistence lineage, idempotency keys, internal statuses, and unused timestamps are omitted.
- Ledger rows include only editable and displayed transaction fields plus minimal source, category, and payee relations.
- Review queue rows include the candidate payload, duplicate display fields, and only the OCR text needed by the review page. Failed intake rows contain only displayed failure fields.
- Share-batch polling omits processing lineage, attempts, failure metadata, and timestamps that are not displayed.
- Direct OCR returns the candidate ID, optional transaction ID, auto-confirmation state, and recovery state. Full intake, candidate, and transaction records remain server-side.

### Transaction GET filters

| Query parameter | Behavior |
| --- | --- |
| `status` | Uses a valid Finance status, otherwise defaults to `confirmed`. |
| `source_id` | Filters to one valid source UUID. |
| `q` | Up to 100 characters after unsafe PostgREST filter punctuation is removed. |
| `category_id` | Filters to one valid category UUID. |
| `uncategorised=true` | Filters to null category. Cannot be combined with `category_id`. |
| `date` | Filters to one exact `YYYY-MM-DD` date. |

## Data retention and cleanup

### Direct screenshot upload

- Image bytes remain in browser, request, and OCR process memory only.
- The service does not persist direct image bytes to Storage.
- The image hash, OCR output, parser result, and processing lineage are persisted in Finance tables.

### Android share batch

- Image bytes are uploaded to the private `finance-share-batches` Storage bucket.
- Signed upload tokens authorize only reserved paths.
- Render downloads only the authoritative path returned by the queue claim RPC.
- Temporary objects and private transient batch records are removed after all items reach terminal state and Storage deletion is verified.
- OCR intake and candidate or transaction lineage remain in public Finance tables.

### Logs

Render logs may contain request IDs, safe failure stage and code, intake and transient identifiers, duration, attempt number, and recovery state. They must not contain screenshots, Storage paths, signed URLs, access tokens, secret keys, or OCR text.

## Environment and deployment

### Required web environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public browser authentication key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted Next.js server access to application tables and RPCs. |
| `APP_ORIGIN` | Trusted deployed web origin used by application and authentication flows. |
| `NEXT_PUBLIC_FINANCE_OCR_URL` | Public Render OCR origin with no trailing slash. |
| `FINANCE_QUEUE_WAKE_SECRET` | Server-only secret used to wake Render's queue consumer. |

### Required OCR environment

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Used only for `auth.getUser(accessToken)`. |
| `SUPABASE_SECRET_KEY` | Used only after verified authentication and Finance authorization. |
| `ALLOWED_ORIGINS` | Explicit comma-separated browser origins. Wildcards are rejected. |
| `FINANCE_QUEUE_WAKE_SECRET` | Must match the web value and contain at least 32 bytes. |
| `FINANCE_SHARE_BUCKET` | Must be `finance-share-batches`. |
| `FINANCE_SHARE_QUEUE` | Must be `finance_share_ocr`. |

Operational limits are configured through `MAX_IMAGE_BYTES`, `MAX_REQUEST_BYTES`, `MAX_IMAGE_DIMENSION`, `MAX_IMAGE_PIXELS`, `PROCESSING_VERSION`, `INTAKE_LEASE_SECONDS`, `FINANCE_QUEUE_VISIBILITY_SECONDS`, OCR and warm rate limits, and busy retry delay. The queue visibility window must be at least 30 seconds longer than the intake lease.

### Deployment topology

- Web application: Vercel, Node.js 22.22.x.
- OCR service: Render Singapore region, Node.js 22.22.x.
- Database, Auth, Storage, Queue, and Cron: Supabase.
- Health endpoint: Render `/health`.

The Render service uses the repository root as build context because its bundle imports pure Finance parser and type modules from the main application. Do not configure a Render `rootDir` that excludes those files.

### Database rollout rule

Apply only unapplied forward migrations from [`supabase/migrations/`](../supabase/migrations/). Do not edit an applied migration or replay the reviewed baseline over an existing project. When an application or OCR change requires a new RPC signature, deploy the compatible database migration before the caller that requires it.

## Testing and validation

Use Node.js 22.22.0 for both runtimes.

### Web application

```powershell
npm ci
npm audit
npm audit --omit=dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Focused Finance commands:

```powershell
npm run test:finance-security
npm run test:finance-validation
npm run test:finance-payees
npm run test:finance-idempotency
npm run test:finance-ordering
npm run test:finance-share
```

The full suite also includes dashboard-to-ledger filters, tenant-scoped repository filters, settings section routing, API contracts, authentication boundaries, and service-worker lifecycle behavior.

When the share protocol or worker changes:

```powershell
npm run build:service-worker
npm run check:service-worker
```

### OCR service

Run from [`services/finance-ocr/`](../services/finance-ocr/):

```powershell
npm ci
npm audit
npm audit --omit=dev
npm run typecheck
npm test
npm run build
npm start
```

Then verify:

```text
GET /health -> { "status": "ok" }
```

OCR tests cover authentication, CORS, rate limiting, capacity, image validation, source detection, parsing, reference extraction, payees, duplicate handling, fenced intake recovery, queue retries, auto-confirmation gates, and cleanup.

### Database verification

For a production-readiness check:

1. Compare local and remote migration history.
2. Confirm every forward Finance migration is applied exactly once.
3. Run Supabase security and performance advisors.
4. Verify browser roles cannot query Finance tables directly.
5. Verify service-only RPC execute grants and private Storage policies.
6. Exercise manual create, review confirmation replay, payee reuse, edit, delete, direct OCR, and share-batch cleanup against the target environment.

## Safe extension guide

### Adding or changing a transaction field

Review every affected layer:

1. Domain types in [`lib/types.ts`](../lib/types.ts).
2. Shared validation limits and field errors.
3. Server request schemas.
4. Manual, review, and edit forms.
5. Browser API payloads and error handling.
6. Service and repository parameters.
7. A new forward migration and versioned atomic RPC if persistence changes.
8. OCR candidate payload and parser when the field is extractable.
9. Correction recording and learning policy.
10. Search, display, duplicate semantics, and dashboard impact.
11. Root and OCR contract tests.

Do not silently add a field to duplicate matching or automatic confirmation. Those are product and data-integrity decisions that require explicit policy and tests.

### Changing OCR parsing

- Keep parsing functions pure and deterministic.
- Add representative OCR fixtures before widening regular expressions.
- Preserve filename-first source authority and ambiguity guards.
- Do not let Recipient Reference become the transaction reference.
- Avoid aggressive cleanup that can destroy free-form references.
- Re-run duplicate and auto-confirmation tests because parsed values affect both.
- Verify `Retry rules` produces the same behavior as newly processed OCR for the same stored text and context.

### Changing share behavior

- Edit [`service-worker/sw.ts`](../service-worker/sw.ts), never `public/sw.js` directly.
- Update the shared message protocol before changing either endpoint.
- Regenerate and verify the worker artifact.
- Preserve per-tab ownership, acknowledgement, expiry, unauthorized rejection, and navigation disposal behavior.
- Keep upload authorization, object verification, queue commit, terminal result, and cleanup as separate durable phases.

### Changing database behavior

- Add a forward migration.
- Preserve explicit `user_id` ownership checks even inside service-role code.
- Use atomic RPCs for multi-record state changes.
- Preserve idempotent replay and stable lock ordering.
- Revoke default function execution before granting only the required trusted role.
- Add indexes for new foreign keys and production query paths.

## Current limitations and technical debt

### Product limitations

- MYR is the only supported currency.
- There is no bank-feed integration or automated statement import.
- There is no standalone payee-management page.
- Saved-payee classification uses exact normalized canonical names only.
- Payee aliases are not learned.
- Recipient references are stored as Notes and cannot be filtered as an independent semantic field.
- Direct uploads always require review unless recovering an existing terminal result.
- The free Render deployment uses one OCR slot, so concurrent direct requests can receive a retryable busy response.
- Stored OCR text currently has no automatic retention or redaction schedule after confirmation.

### Architecture debt

The repository architecture review tracks these relevant items:

- OCR has no lint command, so the CI validation gate is not yet fully symmetric with the web application.
- Root TypeScript still enables `allowJs`.
- Finance types remain inside the large cross-domain [`lib/types.ts`](../lib/types.ts) file.
- Supabase clients are not parameterized by one reviewed generated `Database` type.
- API error and pagination contracts are not standardized across every repository module.
- Focused service-layer tests remain uneven.
- The Finance review page remains a large stateful client component.
- Several Finance pages still load initial data on the client.
- The OCR package imports shared code through aliases that point to the application root instead of depending on an explicit shared Finance package.

See [`ARCHITECTURE_CLEAN_CODE_REVIEW.md`](./ARCHITECTURE_CLEAN_CODE_REVIEW.md) for repository-wide priorities and completion gates.

## Key implementation references

- Finance authorization and route helpers: [`lib/finance/core/auth.ts`](../lib/finance/core/auth.ts)
- Mutation request security: [`lib/finance/core/requestSecurity.ts`](../lib/finance/core/requestSecurity.ts)
- Shared validation: [`lib/finance/core/values.ts`](../lib/finance/core/values.ts)
- Request parsing: [`lib/finance/core/schemas.ts`](../lib/finance/core/schemas.ts)
- Business workflows: [`lib/finance/core/service.ts`](../lib/finance/core/service.ts)
- Tenant-scoped persistence: [`lib/finance/core/repository.ts`](../lib/finance/core/repository.ts)
- Module reference-data provider: [`app/finance/_components/FinanceReferenceDataProvider.tsx`](../app/finance/_components/FinanceReferenceDataProvider.tsx)
- OCR parser: [`lib/finance/ocr/parser.ts`](../lib/finance/ocr/parser.ts)
- Source detection: [`lib/finance/ocr/sourceDetection.ts`](../lib/finance/ocr/sourceDetection.ts)
- Transaction reference extraction: [`lib/finance/ocr/reference.ts`](../lib/finance/ocr/reference.ts)
- Recipient-reference handling: [`lib/finance/ocr/recipientReference.ts`](../lib/finance/ocr/recipientReference.ts)
- Learned reference transforms: [`lib/finance/ocr/fieldLearning.ts`](../lib/finance/ocr/fieldLearning.ts)
- Duplicate policy: [`lib/finance/transactions/duplicates.ts`](../lib/finance/transactions/duplicates.ts)
- Payee form classification: [`lib/finance/transactions/payeeClassification.ts`](../lib/finance/transactions/payeeClassification.ts)
- Dashboard aggregation: [`lib/finance/dashboard.ts`](../lib/finance/dashboard.ts)
- Share protocol: [`lib/finance/share/protocol.ts`](../lib/finance/share/protocol.ts)
- OCR HTTP server: [`services/finance-ocr/src/app.ts`](../services/finance-ocr/src/app.ts)
- OCR processing pipeline: [`services/finance-ocr/src/processor.ts`](../services/finance-ocr/src/processor.ts)
- Share queue consumer: [`services/finance-ocr/src/queueConsumer.ts`](../services/finance-ocr/src/queueConsumer.ts)
- OCR operations: [`services/finance-ocr/README.md`](../services/finance-ocr/README.md)
- Current recipient-reference and mutation migration: [`supabase/migrations/20260813034905_merge_recipient_reference_into_notes.sql`](../supabase/migrations/20260813034905_merge_recipient_reference_into_notes.sql)
