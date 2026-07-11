# Finance Fix 003: Duplicate and Review Flow

## Summary

This fix centralizes duplicate assessment and completes the manual-review actions promised by the Finance design. It adds deterministic duplicate signals, an explicit "Mark duplicate" transition, an audited override, optional rule creation from a correction, editable learning suggestions, and safe rule retries.

- **Priority:** High
- **Recommended delivery:** After Fixes 001 and 002
- **Depends on:** Transactional confirmation, explicit OCR text hash, currency, and reference number
- **Enables:** Reliable review decisions, better rule learning, and later duplicate-sweep jobs

## Problems Being Fixed

### 1. Duplicate logic is embedded in the upload route

The current upload route checks amount/date and compares a simplified merchant string. That logic cannot be reused consistently by review retry, manual creation, a future Cron sweep, or tests without reproducing it.

### 2. The PRD's duplicate signals are incomplete

Exact image hashing exists, but normalized OCR hash and structured reference-number checks do not. Date/amount/merchant matching does not use source explicitly and does not explain why a row was flagged.

### 3. Review cannot explicitly mark an item as a duplicate

The UI shows a possible-duplicate warning and allows "Confirm anyway," but the only alternative is general rejection. Duplicate is a distinct business outcome and should use the candidate/intake `duplicate` statuses already present in the schema.

### 4. Duplicate overrides are not sufficiently auditable

An override should record who overrode it, which transaction it resembled, which signals matched, and why the ledger transaction was still created.

### 5. A correction cannot directly create a rule

The current correction history can later produce suggestions, but the review screen does not let the user intentionally create a safe merchant/category/source rule while the context is visible.

### 6. Rule suggestions cannot be edited before activation

The rules screen supports only activation or dismissal. A useful suggestion may need a cleaner name, narrower pattern, different category, source, direction, or priority before it becomes active.

### 7. Retry behavior is underspecified

Retry reapplies current rules to OCR text, but duplicate assessment and state-transition expectations are not centralized. Repeated retries should update the same pending candidate and must not create ledger rows unexpectedly.

## Desired Outcome

After this fix:

- all duplicate checks use one deterministic service and one structured result
- duplicate reasons and matched signals are stored and shown to the user
- review supports confirm, reject, retry rules, mark duplicate, and audited duplicate override
- marking a duplicate never creates a ledger transaction
- confirming an override remains idempotent through Fix 001
- users can create a reviewed rule from a correction
- rule suggestions can be edited before activation
- rule retry updates the existing candidate safely and reapplies duplicate checks
- future duplicate sweeps can reuse the same core assessment logic

## Scope

### Included

- centralized exact and deterministic near-duplicate assessment
- structured duplicate metadata
- explicit duplicate state transition
- audited override behavior
- optional manual rule creation from review
- editable rule suggestions
- idempotent rule retry behavior
- review and rule-management UI updates
- automated tests

### Not included

- probabilistic/ML duplicate matching
- automatic deletion of suspected duplicates
- recurring-payment detection
- automatic merging of ledger transactions
- background duplicate sweep scheduling
- multiple transactions per screenshot

## Proposed Duplicate Contract

Create a typed result such as:

```ts
interface FinanceDuplicateAssessment {
    outcome: 'none' | 'possible' | 'strong';
    matchedTransactionId: string | null;
    score: number;
    signals: Array<
        | 'image_hash'
        | 'ocr_text_hash'
        | 'reference_number'
        | 'amount'
        | 'transaction_date'
        | 'source'
        | 'merchant'
    >;
    explanation: string;
}
```

The score should be deterministic and used for ordering/explanation, not as an opaque ML confidence value.

### Suggested signal precedence

1. Same user and exact image hash: reject the repeated upload with the existing intake ID.
2. Same user and exact non-empty reference number, with compatible currency/source: strong duplicate.
3. Same user and exact normalized OCR text hash: strong duplicate.
4. Same user, currency, amount, source, date, and normalized merchant: strong duplicate.
5. Same currency/amount and normalized merchant within a narrow date window: possible duplicate.
6. Same amount/date but weak or missing merchant/source: possible duplicate, never an automatic duplicate decision.

The comparison should never cross user boundaries.

## Proposed Data Changes

Candidate payload already has `duplicate_transaction_id`. Extend it or add explicit candidate columns for:

- `duplicate_outcome`
- `duplicate_score`
- `duplicate_signals`
- `duplicate_explanation`
- `duplicate_checked_at`

For queryability and stable auditing, dedicated columns plus a JSONB signals field are preferable to hiding everything inside the candidate payload.

Add processing events for duplicate assessment and resolution. If a duplicate override requires a user reason, store that reason in a bounded text field or event detail.

Do not create a `finance_transactions` row when a candidate is marked duplicate.

## Likely Files to Change

- a new `lib/finance/duplicates.ts`
- `lib/finance/parser.ts`
- `lib/finance/api.ts`
- `lib/types.ts`
- `app/api/finance/upload/route.ts`
- `app/api/finance/review/route.ts`
- `app/api/finance/transactions/route.ts` if manual-entry duplicate warnings are included
- `app/api/finance/rule-suggestions/route.ts`
- `app/api/finance/rules/route.ts`
- `app/finance/review/page.tsx`
- `app/finance/rules/page.tsx`
- a new forward migration under `document/migrations/`
- duplicate, review, rule, API, and browser tests

## Detailed Implementation Plan

### Step 1: Define merchant and reference normalization helpers

Duplicate comparison needs stable canonical forms separate from display values.

Add pure helpers that:

- lowercase only for comparison
- apply Unicode normalization
- remove punctuation and repeated whitespace
- preserve meaningful letters and digits
- strip known payment boilerplate only when proven safe
- uppercase and trim reference numbers
- never mutate the user-facing merchant/reference stored on the transaction

Examples:

```txt
"JAYA GROCER #0123" -> comparison key "jayagrocer0123"
" Ref: ab-12345 "   -> reference key "AB-12345"
```

Cover bank/e-wallet fixtures relevant to the application rather than adding broad untested rules.

### Step 2: Extract a centralized duplicate service

Create `lib/finance/duplicates.ts`. Keep scoring/policy logic separate from raw database queries where practical.

Recommended split:

- a repository/query function retrieves a bounded list of same-user candidates using indexed fields
- a pure evaluator compares one proposed transaction to those records
- a policy function maps signals to `none`, `possible`, or `strong`

Rough API:

```ts
async function assessFinanceDuplicate(input: {
    userId: string;
    intakeId?: string;
    imageHash?: string | null;
    ocrTextHash?: string | null;
    amount: number | null;
    currency: string | null;
    merchant: string | null;
    transactionDate: string | null;
    sourceId: string | null;
    referenceNumber: string | null;
}): Promise<FinanceDuplicateAssessment>
```

Every query must start with `user_id = current user`. Use indexes on text hash, reference number, amount/date, and source to avoid loading the entire ledger.

### Step 3: Make policy thresholds explicit

Do not scatter magic weights across route handlers. Define named constants and document them.

One possible deterministic policy:

- exact reference: strong
- exact OCR text hash: strong
- amount + date + source + merchant: strong
- amount + date + merchant without source: possible
- amount + merchant within plus/minus one day: possible
- amount/date alone: possible with a low score

Currency must match whenever currency is known. A null/unknown field reduces certainty rather than acting as a wildcard for automatic decisions.

Any fuzzy string similarity should use a documented threshold and fixtures. Start with canonical exact merchant keys before adding edit-distance logic.

### Step 4: Persist the duplicate assessment

Add an additive migration for duplicate columns if they are not kept solely in payload. Backfill existing candidates:

- candidates with `duplicate_transaction_id` become at least `possible`
- signals/explanation may remain empty for historical rows
- `duplicate_checked_at` remains null when the old assessment time is unknown

Store the assessment immediately after parsing and every time rules/parsed fields are retried.

Write a `duplicate_assessed` processing event containing:

- candidate ID
- matched transaction ID
- outcome
- score
- signal names

Do not include full OCR text in event details.

### Step 5: Reuse the service during upload

Replace inline amount/date/merchant duplicate code in `app/api/finance/upload/route.ts`.

Recommended upload behavior:

- exact repeated image hash: return `409` with the existing intake ID, as today
- strong or possible transaction duplicate: create a pending review candidate with assessment metadata
- no duplicate: continue normal confidence/rule handling
- no candidate with any duplicate outcome may auto-confirm

Even a strong text/reference match should be reviewable initially. Automatic duplicate marking can be considered only after production evidence shows the signals are safe.

### Step 6: Add an explicit `mark_duplicate` action

Extend `POST /api/finance/review` or introduce a dedicated candidate-action endpoint.

The action should:

1. authorize Finance access
2. load and lock the current user's pending candidate
3. require a matched transaction ID or a user-selected existing transaction
4. verify the matched transaction belongs to the same user
5. update candidate status to `duplicate`
6. update intake status to `duplicate`
7. preserve duplicate assessment metadata
8. write a processing event with actor and matched transaction ID
9. create no ledger transaction

Perform the candidate/intake/event transition in one database function if possible, following the transactional pattern established in Fix 001.

### Step 7: Make duplicate override explicit and audited

When the user confirms despite an assessment:

- require `allow_duplicate = true`
- optionally require a short reason for strong duplicates
- pass the matched transaction ID and assessment into the confirmation RPC
- record a `duplicate_overridden` event
- retain the original duplicate metadata on the accepted candidate

The confirmed transaction should not receive status `duplicate`; it is a normal confirmed transaction created after an explicit override.

### Step 8: Update the review interface

In `app/finance/review/page.tsx`:

- show the matched transaction's merchant, amount, date, and source when available
- list human-readable matched signals
- distinguish "possible" from "strong" duplicate language
- provide separate actions:
  - `Mark duplicate`
  - `Confirm anyway`
  - `Reject as not a transaction`
- require deliberate confirmation for an override
- keep all controls within the existing design system

Avoid presenting "Reject" and "Mark duplicate" as synonyms; they have different analytics and learning meaning.

### Step 9: Add optional rule creation from review

After the user corrects merchant/category/source/direction, offer a rule draft based on the candidate's normalized OCR context.

Recommended safe flow:

1. user confirms the transaction successfully
2. UI presents or submits a separate rule draft
3. draft defaults to a narrow `merchant_alias` or `exact_phrase`, never a broad keyword
4. user can edit name, pattern, category, source, direction, and priority
5. the normal Finance rule endpoint validates ownership and saves it as a manual active rule
6. the rule records its originating transaction/candidate if provenance fields are added

Rule creation should not cause a confirmed transaction to roll back. If it fails, show "Transaction confirmed; rule could not be created" and let the user retry rule creation.

### Step 10: Make learning suggestions editable

Add an update action for pending `finance_rule_suggestions`, or allow validated overrides during acceptance.

Editable fields should include:

- display name
- pattern
- category
- direction
- optional source
- priority
- match type, limited to safe allowed values

Recommended endpoint split:

- `PUT/PATCH /api/finance/rule-suggestions`: update a pending suggestion owned by the user
- existing resolve action: accept or reject the current saved version

On acceptance:

1. lock the pending suggestion
2. validate referenced source/category ownership and direction compatibility
3. insert the learning rule
4. mark the suggestion accepted

The insert/update should be transactional to avoid an active rule with a still-pending suggestion.

### Step 11: Make retry deterministic and idempotent

`retry` should:

1. operate only on the same pending candidate
2. read normalized OCR with legacy fallback
3. reapply current parser/rules
4. reassess duplicates through the centralized service
5. update payload, confidence, matched rule, and duplicate metadata
6. record a `review_retried` event
7. not create a ledger transaction automatically in v1

Repeated retries with unchanged rules/data should produce the same candidate result. If future behavior auto-confirms after retry, that should be a separate product decision using the Fix 001 RPC.

### Step 12: Prepare the service for future jobs

Keep the duplicate evaluator callable without an HTTP request so a future Cron duplicate sweep can reuse it. Do not schedule that job in this fix.

## Rollout Strategy

1. Deploy duplicate metadata columns and indexes additively.
2. Deploy the centralized service while preserving current UI behavior.
3. Compare new assessments with current inline results in logs/metrics without changing decisions.
4. Switch upload and retry to the centralized service.
5. Enable explicit mark-duplicate and audited override actions.
6. Enable rule creation from review.
7. Enable suggestion editing and transactional acceptance.
8. Remove the old inline duplicate code after validation.

## Testing Plan

### Pure duplicate evaluator tests

- exact reference produces strong outcome
- exact normalized text hash produces strong outcome
- same amount/date/source/merchant produces strong outcome
- same amount/date with missing merchant produces only possible outcome
- currency mismatch does not produce a strong match
- comparisons never include another user's transaction
- null fields reduce certainty safely
- merchant normalization is deterministic
- date-window boundaries are correct

### Database/API tests

- exact image reupload returns `409` and existing intake ID
- possible duplicate creates a pending review candidate
- duplicate candidate cannot auto-confirm
- mark duplicate updates candidate and intake atomically
- mark duplicate creates no transaction
- duplicate override creates exactly one confirmed transaction and an audit event
- invalid matched transaction ownership is rejected
- retry updates the same candidate and creates no transaction

### Rule tests

- a corrected review item can produce a narrow rule draft
- transaction remains confirmed if optional rule creation fails
- pending suggestion fields can be edited
- accepting a suggestion atomically creates one active rule and marks it accepted
- rejected suggestions create no rule
- user cannot edit or accept another user's suggestion

### Browser tests

- review shows duplicate strength and signals
- user can mark duplicate separately from reject
- strong override requires explicit confirmation/reason
- rule draft is editable before creation
- suggestion is editable before activation

## Acceptance Criteria

- [ ] One shared service owns Finance duplicate assessment.
- [ ] Assessment results contain outcome, score, matched transaction, signals, and explanation.
- [ ] Exact image, text hash, reference, and deterministic field matches are covered.
- [ ] Any duplicate assessment prevents automatic confirmation.
- [ ] Review exposes separate mark-duplicate, reject, and override actions.
- [ ] Marking duplicate updates candidate/intake and creates no ledger transaction.
- [ ] Override is explicit, audited, and idempotent.
- [ ] Retry reapplies rules and duplicate assessment to the existing candidate without auto-creating a transaction.
- [ ] Review can create a narrow editable rule from a correction.
- [ ] Rule suggestions can be edited before activation.
- [ ] Rule acceptance is transactional with suggestion status update.
- [ ] Automated tests cover signal precedence, ownership, state transitions, overrides, retries, and rules.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fuzzy matching creates false positives. | Start with deterministic canonical matches and send all possible matches to review. |
| Missing fields act like unsafe wildcards. | Reduce scores for missing fields; never treat null as a strong match. |
| User cannot understand why an item was flagged. | Persist and display named signals and matched transaction details. |
| Mark-duplicate partially updates state. | Use a transactional database transition like Fix 001. |
| Rule created from correction is too broad. | Default to exact phrase/merchant alias and require user review. |
| Retry unexpectedly confirms a transaction. | Keep retry non-confirming in v1 and document the rule. |

## Rollback

If duplicate assessment is too noisy:

1. disable the new decision policy with a feature flag
2. keep persisted metadata for analysis
3. return all assessed items to ordinary pending review rather than auto-marking them
4. retain mark-duplicate records already chosen by users
5. narrow thresholds through a new policy version instead of rewriting historical assessment explanations
