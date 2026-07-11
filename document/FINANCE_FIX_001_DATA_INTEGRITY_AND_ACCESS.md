# Finance Fix 001: Data Integrity and Access

## Summary

This fix protects the Finance ledger from partial writes, repeated confirmations, access-control inconsistencies, unconfirmed dashboard rows, and destructive transfer cleanup.

The most important change is to move candidate confirmation into one transactional database operation. Today the API creates a ledger transaction, inserts correction rows, and then updates the candidate and intake separately. If any later write fails, the API returns an error even though a confirmed transaction may already exist. Retrying can then create a second transaction.

- **Priority:** Critical
- **Recommended delivery:** First Finance remediation pull request
- **Depends on:** A database backup and confirmation of which Finance migrations have already run
- **Blocks:** Reliable duplicate handling and review-flow expansion

## Problems Being Fixed

### 1. Review confirmation is not atomic

`app/api/finance/review/route.ts` currently performs these operations independently:

1. insert a confirmed transaction
2. insert zero or more correction rows
3. mark the candidate as accepted
4. mark the intake item as completed

An error after step 1 leaves durable state behind while the candidate may remain pending. The user sees a failure, retries, and can create a duplicate transaction.

### 2. Automatic confirmation has the same partial-write risk

`app/api/finance/upload/route.ts` inserts the candidate, conditionally inserts a transaction, then updates the intake and writes processing events. These writes are also not one atomic state transition.

### 3. The schema does not enforce one ledger transaction per intake

V1 intentionally produces one candidate per screenshot, but the database does not prevent several `finance_transactions` rows from using the same `intake_item_id`.

### 4. Page-level Finance access is incomplete

Finance API routes call `authorizeFinance()`, and the sidebar hides Finance for denied users. However, `components/organisms/AppShell.tsx` does not include `/finance` in its module route rules. A denied authenticated user can therefore open the page shell directly, even though its API calls fail with `403`.

This is not currently a confirmed data leak because the APIs remain protected, but it is inconsistent behavior and weakens defense in depth.

### 5. Dashboard recent activity can include non-confirmed rows

`app/api/finance/dashboard/route.ts` filters monthly totals to `status = 'confirmed'`, but the recent-transactions query does not apply the same filter. The transaction API also accepts valid caller-supplied statuses, so review, rejected, or duplicate ledger rows could appear in recent activity.

### 6. Transfer removal may destroy existing data

`document/migrations/20260712_remove_finance_transfers.sql` starts by deleting all transfer transactions. Whether that file may be changed depends on whether it has run anywhere. An already-applied migration must be treated as immutable.

## Desired Outcome

After this fix:

- confirming a candidate is one all-or-nothing database transaction
- automatic confirmation uses the same safe state transition
- repeated confirmation requests return the already-created transaction instead of creating another one
- one screenshot intake can create at most one ledger transaction in v1
- candidate, intake, correction, transaction, and processing-event states cannot diverge during confirmation
- users without Finance access cannot open Finance pages or call Finance APIs
- all dashboard activity is based on confirmed transactions
- legacy transfer data is preserved or explicitly recovered rather than silently deleted

## Scope

### Included

- a forward database migration for integrity constraints and the confirmation function
- transactional manual and automatic confirmation
- idempotent confirmation behavior
- Finance page route protection
- confirmed-only dashboard recent activity
- a deployment-safe decision for transfer cleanup
- targeted unit, API, database, and browser tests

### Not included

- richer duplicate matching signals
- raw/normalized OCR schema changes
- source/category management UI
- recurring-payment detection
- asynchronous OCR processing

Those are covered by later plans.

## Likely Files to Change

- `app/api/finance/review/route.ts`
- `app/api/finance/upload/route.ts`
- `app/api/finance/dashboard/route.ts`
- `components/organisms/AppShell.tsx`
- `lib/finance/api.ts`
- `lib/types.ts`
- a new forward migration under `document/migrations/`
- Finance database/API tests introduced by the testing plan
- `document/migrations/20260712_remove_finance_transfers.sql` only if it is proven to be unapplied everywhere

## Detailed Implementation Plan

### Step 1: Audit deployment state before editing migrations

Before writing SQL:

1. Identify every environment that may have run the Finance migrations.
2. Check the deployment or migration ledger for:
   - `20260710_finance_tracking.sql`
   - `20260711_finance_sources.sql`
   - `20260712_remove_finance_transfers.sql`
3. Count existing Finance rows by direction and intake:
   - transfers still present
   - duplicate non-null `intake_item_id` values
   - more than one candidate for the same intake
   - accepted candidates without a ledger transaction
   - pending candidates that already have a ledger transaction
4. Take a database backup before running cleanup or constraint migrations.

Do not add a uniqueness constraint until existing conflicting rows have been reviewed and resolved.

### Step 2: Decide how to preserve legacy transfers

Use one of these branches:

#### If the transfer-removal migration has not run anywhere

It may be revised only after confirming it is not part of any shared migration history. Replace the unconditional deletion with an archival step, for example:

1. create a `finance_legacy_transfers` table containing the original transaction columns plus `archived_at` and `archive_reason`
2. copy all transfer rows into it
3. verify copied row counts and identifiers
4. remove transfer rows from the active ledger
5. tighten the active direction constraint to expense/income

Do not convert a transfer into an expense or income automatically. The current schema has only one source and cannot represent both sides of a transfer accurately.

#### If the migration has run in any shared environment

Do not rewrite it. Instead:

1. determine whether deleted rows can be restored from a backup or point-in-time recovery
2. add a new forward recovery migration or controlled restoration script
3. preserve restored rows in a legacy table because the active constraint no longer accepts `transfer`
4. document the recovery result and any unrecoverable records

### Step 3: Clean inconsistent intake state

Create a one-time audit query or administrative script that lists inconsistencies without changing them automatically.

Review and resolve each category:

- several transactions for one intake: retain the verified transaction and archive/delete only with explicit approval
- accepted candidate without transaction: return it to pending or reconstruct the transaction from audited data
- pending candidate with transaction: connect it to that transaction and mark it accepted
- completed intake without accepted candidate/transaction: return it to review unless an audit explains the state

Record row counts before and after cleanup.

### Step 4: Add database idempotency constraints

Add an additive forward migration. Recommended constraints:

1. A partial unique index on `finance_transactions(intake_item_id)` where `intake_item_id is not null`.
2. A unique index on `finance_candidate_transactions(intake_item_id)` if the one-candidate-per-intake v1 decision is confirmed.
3. An optional `confirmed_transaction_id` foreign key on `finance_candidate_transactions` for an explicit candidate-to-ledger link.

The transaction index is the final defense against duplicate confirmation, even if an API request is repeated or two requests race.

Rough SQL shape:

```sql
create unique index finance_transactions_unique_intake_idx
  on public.finance_transactions(intake_item_id)
  where intake_item_id is not null;

alter table public.finance_candidate_transactions
  add column if not exists confirmed_transaction_id uuid
  references public.finance_transactions(id) on delete set null;
```

The exact constraint names should follow the repository's migration conventions.

### Step 5: Create one transactional confirmation function

Add a Postgres function such as `finance_confirm_candidate`. A Postgres function executes inside one database transaction, which is necessary because the Supabase JavaScript client does not wrap several independent calls in a transaction.

The function should accept:

- current user ID
- candidate ID
- source ID
- optional category ID
- direction
- amount
- merchant/payee
- transaction date
- notes
- duplicate override flag
- confirmation actor or mode (`manual` or `automatic`)

The function should:

1. lock the candidate using `select ... for update`
2. verify candidate ownership and that its intake belongs to the same user
3. check whether a confirmed transaction already exists for the intake
4. if one exists and the candidate is already accepted, return it as an idempotent success
5. reject invalid state transitions, such as confirming a rejected candidate
6. validate that the source belongs to the user and is not archived
7. validate that the optional category belongs to the user and matches the direction
8. re-check duplicate restrictions and require the explicit override where applicable
9. insert the confirmed transaction
10. insert field-level corrections when the submitted value differs from the candidate payload
11. update the candidate to `accepted` and store `confirmed_transaction_id`
12. update the intake to `completed`
13. insert a processing event describing the confirmation mode, confidence, candidate ID, and transaction ID
14. return the created or existing transaction

Rough control flow:

```sql
select * into candidate_row
from finance_candidate_transactions
where id = candidate_id and user_id = requested_user_id
for update;

if not found then
  raise exception 'review item not found';
end if;

select * into existing_transaction
from finance_transactions
where intake_item_id = candidate_row.intake_item_id;

if existing_transaction.id is not null then
  return existing_transaction;
end if;

-- Validate references and duplicate override.
-- Insert transaction and corrections.
-- Update candidate and intake.
-- All statements commit or roll back together.
```

Security requirements for the function:

- use a fixed `search_path`
- grant execution only to the role used by trusted server code
- revoke execution from `public`
- validate ownership inside the function even though the API already checks it
- never trust a client-supplied user ID without matching it to the authenticated server session

### Step 6: Update manual review confirmation

Refactor `POST /api/finance/review` so the `confirm` action:

1. validates request shape and Finance module access
2. passes the authenticated user's ID and corrected values to the RPC
3. maps known database errors to `400`, `404`, or `409`
4. returns the RPC's transaction

Remove the independent transaction, correction, candidate, and intake writes after the RPC path is verified.

The existing `reject` and `retry` actions can remain separate initially, but they should continue to use user-scoped conditions. The explicit duplicate transition will be addressed in Fix 003.

### Step 7: Update automatic confirmation

Refactor the upload flow so it does not mark a candidate accepted before the transaction exists.

Recommended sequence:

1. insert the intake in `processing`
2. run OCR, parsing, rules, and duplicate checks
3. insert the candidate as `pending`
4. if it meets automatic-confirmation requirements, call the same confirmation RPC with mode `automatic`
5. otherwise set the intake to `review`

This keeps manual and automatic confirmation behavior consistent. The database function, not the route, becomes the owner of the accepted/completed state transition.

### Step 8: Protect Finance page routes

Add Finance to `MODULE_ROUTE_RULES` in `components/organisms/AppShell.tsx` using the same pattern as the existing managed modules.

Expected behavior:

- a user with Finance access sees Finance pages normally
- a signed-in user denied Finance access is redirected to the established safe route or shown the existing forbidden state
- API routes continue returning `403`
- sidebar hiding remains unchanged

Protect the `/finance` prefix so it covers dashboard, add, review, transactions, categories, rules, and future source-management routes.

### Step 9: Restrict dashboard recent activity

Add `.eq('status', 'confirmed')` to the recent-transactions query in `app/api/finance/dashboard/route.ts`.

Also consider tightening `POST /api/finance/transactions` so ordinary manual creation cannot choose arbitrary internal statuses. The simplest v1 contract is:

- manual creation always produces `confirmed`
- review/duplicate/rejected statuses are controlled only by dedicated server workflows

### Step 10: Add observability

Log structured processing events for:

- confirmation requested
- confirmation completed
- idempotent replay returned
- confirmation rejected because of state or duplicate conflict
- confirmation failed and rolled back

Do not store screenshot bytes or unnecessary sensitive request bodies in event details.

## Rollout Strategy

1. Back up the database and run read-only integrity queries.
2. Resolve existing duplicate-intake conflicts.
3. Deploy the additive columns/indexes and transactional function.
4. Keep the old API code available behind a temporary feature flag if practical.
5. Switch manual review confirmation to the RPC.
6. Test repeated and concurrent confirmation in a staging environment.
7. Switch automatic confirmation to the same RPC.
8. Remove the old multi-write paths after production verification.
9. Apply the page guard and dashboard filter in the same release or an earlier low-risk patch.

## Testing Plan

### Database integration tests

- confirming a valid pending candidate creates one transaction, corrections, an accepted candidate, and a completed intake
- a failure while validating or inserting rolls back every change
- repeating the same request returns the same transaction ID
- two concurrent confirmations result in one transaction
- a rejected candidate cannot be confirmed
- a candidate owned by another user cannot be confirmed
- a source/category owned by another user is rejected
- category direction mismatch is rejected
- duplicate conflict requires an explicit override

### API tests

- Finance access denial returns `403`
- validation failures map to stable response codes/messages
- the confirm endpoint returns the idempotent existing transaction on replay
- automatic confirmation and manual confirmation produce the same final state

### Dashboard tests

- monthly totals include only confirmed transactions
- recent transactions include only confirmed transactions
- rejected, review, and duplicate-status rows never appear

### Browser tests

- a denied user cannot open any `/finance` page
- a permitted user can confirm a review item
- double-clicking or resubmitting confirmation does not create two entries
- a simulated confirmation failure leaves the review item pending and creates no ledger transaction

### Migration tests

- the integrity migration succeeds with a clean database
- it fails safely or reports conflicts when duplicate intake rows exist
- transfer archival preserves every source row and identifier before active-row removal
- an already-applied transfer migration is never silently rewritten

## Acceptance Criteria

- [ ] Confirmation is performed by one transactional database function.
- [ ] Manual and automatic confirmation use the same state-transition logic.
- [ ] One non-null intake ID can reference at most one Finance transaction.
- [ ] Replaying a successful confirmation returns the original transaction.
- [ ] No failure can leave a transaction confirmed while its candidate remains pending.
- [ ] All source, category, candidate, and intake ownership checks exist inside the transactional boundary.
- [ ] `/finance` and all nested pages enforce Finance module access.
- [ ] Finance APIs continue returning `403` for denied users.
- [ ] Dashboard totals and recent activity use confirmed transactions only.
- [ ] Existing transfer rows are archived or recovered according to deployment state.
- [ ] Automated tests cover rollback, replay, concurrency, ownership, and dashboard filtering.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Existing duplicate intake rows block the unique index. | Run a read-only audit and resolve conflicts before applying the constraint. |
| A security-definer function expands access accidentally. | Fix the search path, restrict execute grants, and validate ownership inside the function. |
| API and database validation drift. | Treat database validation as authoritative and add integration tests for both layers. |
| Rewriting an applied migration breaks migration history. | Determine deployment state first and use a forward migration for any applied environment. |
| Transfer data is already deleted. | Use backup or point-in-time recovery, then store recovered rows in a legacy table. |
| RPC rollout introduces a new failure mode. | Deploy additively, validate in staging, and temporarily retain a controlled rollback path. |

## Rollback

If the new API path fails after deployment:

1. switch the route back to the previous path only if doing so will not reintroduce duplicate writes
2. keep the uniqueness constraint in place as protection
3. do not drop the transactional function or new link column until production state has been audited
4. investigate processing events and candidate/intake states
5. use a forward migration for schema rollback rather than editing the applied migration

The page guard and dashboard status filter can remain even if the transactional rollout is paused.
