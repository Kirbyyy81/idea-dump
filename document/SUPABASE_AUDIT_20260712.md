# Supabase Live Schema and Security Audit

## Purpose

This document records the database, authorization, storage, migration, and performance issues found in the live IdeaDump Supabase project on 2026-07-12.

The audit is intended to answer four questions:

- what is currently unsafe or unnecessarily exposed
- what is structurally fragile even though the current data is consistent
- what should be changed, in what order, and why
- how each change should be verified after deployment

This is a read-only assessment. No database definition, data, authentication setting, Storage setting, or repository source file was changed while gathering the findings.

---

## Source of Truth

All database findings in this report come from the live Supabase project, not from repository migration files or schema assumptions.

The audit used these Supabase plugin operations:

- project metadata lookup
- verbose table and constraint discovery
- security and performance advisors
- remote migration history
- read-only SQL against PostgreSQL system catalogs
- aggregate-only integrity checks
- Supabase documentation search

### Live Project Snapshot

| Item | Live value |
|---|---|
| Project | `idea-dump` |
| Project reference | `xcaxukhjkqqnmzziqrkc` |
| Project status | `ACTIVE_HEALTHY` |
| Region | `ap-southeast-1` |
| PostgreSQL | `17.6.1.063` |
| Public application tables | 24 |
| Tables with RLS enabled | 24 |
| Tables with RLS policies | 4 |
| Tables with RLS but no policies | 20 |
| Security Advisor findings | 24 |
| Performance Advisor findings | 43 |
| Recorded remote migrations | 3 |
| Storage buckets | 1 |
| Storage objects in `film-covers` | 0 |

### Current Data Safety Checks

The present data is internally consistent, which means several recommended constraints can be added without first repairing existing rows.

| Check | Result |
|---|---:|
| Projects with null `user_id` | 0 |
| Notes with null `project_id` | 0 |
| API keys with null `user_id` | 0 |
| Daily logs whose user no longer exists | 0 |
| Tickets linked to another user's project | 0 |
| Film ownership mismatches | 0 |
| Finance ownership mismatches | 0 |
| Candidate rows referencing a missing matched rule | 0 |
| Candidate confidence outside `0..1` | 0 |
| Duplicate API-key hash groups | 0 |
| Finance transactions with `direction = 'transfer'` | 1 |

The zero counts are point-in-time results. Re-run the checks inside or immediately before the eventual migration so a concurrent write cannot invalidate the preconditions.

---

## Recommended Execution Order

| Order | Area | Priority | Reason |
|---:|---|---|---|
| 1 | Lock down the Finance `SECURITY DEFINER` function | Critical | Anonymous callers can currently invoke a privileged, data-writing function. |
| 2 | Close the ticket/project tenant-boundary gap | High | The database permits a user-owned ticket to reference another user's project. |
| 3 | Choose and enforce one database access model | High | Current policies enforce ownership but do not enforce application RBAC. |
| 4 | Establish an authoritative migration baseline | High | Only three migrations are recorded for a 24-table live schema. |
| 5 | Add ownership, lifecycle, and domain constraints | High | Current data is clean, but the schema permits future invalid states. |
| 6 | Harden Storage and Auth settings | Medium | The bucket is public and unrestricted; leaked-password protection is disabled. |
| 7 | Add missing indexes and optimize RLS policies | Medium | Supabase reports 20 unindexed foreign keys and 16 slow policy expressions. |
| 8 | Review unused indexes and schema naming | Low | These are maintenance improvements, not immediate security fixes. |

---

## 1. Privileged Finance Function Is Publicly Executable

**Priority:** Critical
**Live evidence:** Supabase Security Advisor lints `0028` and `0029`

`public.finance_refresh_rule_suggestions()` is a `SECURITY DEFINER` function owned by `postgres`. It writes to `finance_rule_suggestions` while running with its owner's privileges.

The live privilege checks show:

| Role | Can execute |
|---|---|
| `anon` | Yes |
| `authenticated` | Yes |
| `service_role` | Yes |

The function is also exposed as:

```text
POST /rest/v1/rpc/finance_refresh_rule_suggestions
```

An unauthenticated caller can therefore trigger a global aggregation and upsert across user Finance data. The function does not directly return private rows, but it permits unauthorized writes and can be repeatedly invoked to consume database resources.

The function is already scheduled through `pg_cron` at `03:15` each day, so public API execution is unnecessary unless there is a separately documented manual-use requirement.

### Suggested action

1. Revoke execution from `PUBLIC`, `anon`, and `authenticated`.
2. Retain execution only for the function owner and `service_role` if manual server-side execution is genuinely required.
3. Change the function search path from `public` to an empty search path because every referenced table is already schema-qualified.
4. Change default function privileges so future functions are not automatically executable by public API roles.
5. Keep the scheduled job active and verify that it still runs as its privileged database role.

Suggested migration shape:

```sql
revoke execute on function public.finance_refresh_rule_suggestions()
from public, anon, authenticated;

grant execute on function public.finance_refresh_rule_suggestions()
to service_role;

alter function public.finance_refresh_rule_suggestions()
set search_path = '';

alter default privileges for role postgres in schema public
revoke execute on functions from public, anon, authenticated;
```

Default privileges are creator-role-specific. Repeat the default-privilege rule for every database role that is allowed to create functions; configuring only `postgres` does not protect functions created by a different owner.

### Verification

- `has_function_privilege('anon', ..., 'EXECUTE')` returns false.
- `has_function_privilege('authenticated', ..., 'EXECUTE')` returns false.
- The Supabase lints `0028` and `0029` disappear.
- The `finance-rule-learning` cron job completes successfully on its next run.
- `service_role` can invoke the function only if that permission is intentionally retained.

References:

- [Supabase Database Functions security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)
- [Advisor lint 0028](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)

---

## 2. Tickets Can Reference Another User's Project

**Priority:** High
**Live evidence:** Current `tickets` RLS policy and foreign-key definitions

The `tickets` insert policy checks only:

```sql
auth.uid() = user_id
```

The database separately enforces:

- `tickets.user_id -> auth.users.id`
- `tickets.project_id -> projects.id`

It does not enforce that the referenced project belongs to the same user as the ticket. A signed-in user who learns another project UUID can insert a ticket with their own `user_id` and the other user's `project_id`.

The live `tickets.project_id` column is already non-null, so every ticket is expected to belong to a project.

There are currently zero mismatched rows, so the risk is structural rather than an existing data breach.

### Suggested action

1. Make `projects.user_id` non-null.
2. Add a unique parent key on `projects(id, user_id)`.
3. Add and validate a composite foreign key from `tickets(project_id, user_id)` to `projects(id, user_id)` with the same delete behavior as the existing relationship.
4. Make the insert and update policies explicitly require an owned project with an `exists` check.
5. Add `TO authenticated` to every user-facing policy.
6. After validation succeeds, drop the old single-column `tickets_project_id_fkey` instead of retaining duplicate foreign keys indefinitely.

Suggested constraint shape:

```sql
alter table public.projects
  alter column user_id set not null,
  add constraint projects_id_user_id_key unique (id, user_id);

alter table public.tickets
  add constraint tickets_project_user_id_fkey
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

alter table public.tickets
  drop constraint tickets_project_id_fkey;
```

### Verification

- Cross-user ticket/project inserts fail at the database layer.
- Same-user ticket creation still succeeds.
- The aggregate mismatch query remains zero.
- Normal project deletion still cascades to its tickets.

---

## 3. RLS Ownership Policies Do Not Enforce Application RBAC

**Priority:** High if module RBAC is authoritative; otherwise Medium
**Live evidence:** `pg_policies`, table grants, and live RBAC tables

Only these tables have RLS policies:

- `projects`
- `daily_logs`
- `tickets`
- `finance_sources`

Their policies check row ownership through `auth.uid()`. They do not consult:

- `BRIDGE_user_roles`
- `BRIDGE_role_modules`
- `app_user_module_overrides`

The policies are also assigned to `PUBLIC`, while `anon` and `authenticated` have broad table grants. Anonymous requests do not see the user-owned rows because `auth.uid()` is null, but a signed-in user can use the Supabase Data API directly whenever an ownership policy allows it.

If an application-level module denial is expected to prevent database access, that denial can currently be bypassed for these four tables.

### Suggested action

Choose one access model and enforce it consistently.

#### Option A: Direct Data API with database-enforced RBAC

- Add a narrowly scoped RBAC helper in an unexposed schema.
- Combine module access and row ownership in every relevant RLS policy.
- Scope policies with `TO authenticated`.
- Keep helper functions unavailable through REST/RPC.
- Add automated RLS tests for owner, admin, member, denied override, and anonymous roles.

#### Option B: Server-only data access

- Revoke table privileges from `anon` and `authenticated` for server-only tables.
- Move sensitive operational tables to an unexposed schema where practical.
- Keep RLS enabled as defense in depth.
- Expose only narrow server APIs or carefully designed RPCs.
- Reserve `service_role` for trusted server paths.

### Verification

- A user denied a module cannot read or mutate its data by calling Supabase REST directly.
- Allowed users retain expected access.
- Anonymous access remains empty or rejected.
- RLS tests run in CI using real JWT role contexts.

---

## 4. Twenty Tables Have RLS Enabled but No Policies

**Priority:** Medium architectural decision
**Live evidence:** Supabase Security Advisor lint `0008`

These tables are fail-closed for ordinary Data API users because RLS is enabled and no policies exist:

| Area | Tables |
|---|---|
| RBAC | `DIM_roles`, `DIM_modules`, `BRIDGE_role_modules`, `BRIDGE_user_roles`, `app_user_module_overrides` |
| API keys | `api_keys` |
| Notes | `notes` |
| Film | `film_cameras`, `film_rolls`, `film_maintenance_records`, `film_photos`, `film_drive_connections` |
| Finance | `finance_categories`, `finance_intake_items`, `finance_transactions`, `finance_candidate_transactions`, `finance_rules`, `finance_corrections`, `finance_processing_events`, `finance_rule_suggestions` |

This is not automatically a data exposure. It is a warning that the access model is implicit: normal clients are denied, while privileged server clients can bypass RLS.

### Suggested action

- If a table should be client-accessible, add explicit least-privilege policies scoped to `authenticated`.
- If a table should remain server-only, revoke `anon` and `authenticated` grants or move it to an unexposed schema.
- Document the intended model per table so a future developer does not add a permissive policy merely to silence the advisor.
- Do not add blanket `using (true)` policies.

### Verification

- Every table has an explicit classification: direct-client, server-only, or administrative.
- Supabase lint `0008` remains only where a deliberately documented fail-closed design is retained.
- Authenticated user tokens cannot read or mutate rows in server-only tables. A denied `SELECT` may still return a successful response containing zero rows.

Reference: [Advisor lint 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

---

## 5. Remote Migration History Is Incomplete

**Priority:** High
**Live evidence:** Supabase migration registry and live table inventory

The live database contains 24 public application tables, but Supabase reports only three recorded migrations:

| Version | Name |
|---|---|
| `20260626034325` | `20260626_repair_rbac_modules` |
| `20260626065533` | `20260626_module_metadata` |
| `20260710081850` | `simplify_film_roll_statuses` |

The remote migration registry therefore does not explain how the current database can be rebuilt. This creates recovery, branching, onboarding, and schema-drift risk.

### Suggested action

1. Export an authoritative baseline from the live database.
2. Review the baseline for ownership, grants, RLS, functions, triggers, Storage policies, and extension state.
3. Store it under the standard Supabase migration structure.
4. Validate the schema-only baseline on a fresh local or Supabase branch database.
5. Compare that fresh database against production and require an exact, reviewed schema diff.
6. Reconcile the remote migration ledger only after that exact diff; do not replay the baseline or blindly mark it applied in production.
7. Require all future DDL to use forward-only named migrations.
8. Add a CI schema-diff check between the expected migration result and a clean database.

### Verification

- A clean database created from migrations contains all 24 tables, constraints, policies, functions, triggers, and required extensions.
- Supabase branching or local reset succeeds without manual SQL.
- A schema diff against production is empty or contains only approved environment-specific objects.

---

## 6. Ownership Columns Are Nullable

**Priority:** High integrity hardening
**Live evidence:** Verbose live table metadata and aggregate null counts

These ownership or parent-reference columns are nullable:

| Table | Column | Current null rows |
|---|---|---:|
| `projects` | `user_id` | 0 |
| `notes` | `project_id` | 0 |
| `api_keys` | `user_id` | 0 |

Nullable ownership produces records that ordinary RLS policies cannot match and that application users may be unable to recover.

### Suggested action

- Set all three columns to `NOT NULL` in a forward migration.
- Run the zero-null preflight again inside the deployment transaction.
- Retain the existing foreign keys and intended cascade behavior.

### Verification

- Inserts omitting the ownership column fail.
- Existing records remain accessible to their owners.
- Null-count checks remain zero.

---

## 7. `daily_logs.user_id` Has No Auth Foreign Key

**Priority:** High integrity and retention
**Live evidence:** The live table has no foreign key for `daily_logs.user_id`

`daily_logs.user_id` is non-null but is not constrained to `auth.users(id)`. The current database contains zero log rows whose user is missing, so a foreign key can be added without repairing existing data.

Without a foreign key, user deletion can leave orphaned productivity data indefinitely.

### Suggested action

- Decide the desired retention rule before changing the schema.
- For normal personal-data deletion, add `references auth.users(id) on delete cascade`.
- If audit retention is required, implement an explicit anonymization or retention workflow instead of accidental orphaning.

### Verification

- Invalid user IDs cannot be inserted.
- Deleting a test user produces the documented cascade or anonymization behavior.
- The orphan-count query remains zero.

---

## 8. Tenant Ownership Is Not Enforced Across Film and Finance Relationships

**Priority:** High defense in depth
**Live evidence:** Live foreign keys reference record IDs but not matching `user_id` values

Current rows have zero ownership mismatches, but the schema allows a privileged or faulty write to connect one user's child row to another user's parent row.

Affected relationships include:

### Film

- roll to camera
- maintenance record to camera
- photo to film roll
- roll cover photo to the same roll and user

### Finance

- transaction to source, category, and intake item
- candidate to intake item and matched rule
- rule to source and category
- correction to transaction and intake item
- processing event to intake item
- rule suggestion to category

### Suggested action

1. Add parent uniqueness on `(id, user_id)` where required.
2. Replace single-column references with composite tenant-safe foreign keys.
3. Use `NOT VALID` followed by `VALIDATE CONSTRAINT` if future table sizes make lock duration important.
4. Add an explicit constraint or trigger ensuring a roll's `cover_photo_id` belongs to that same roll and user.
5. Preserve each existing foreign key's `ON DELETE` and `ON UPDATE` behavior during replacement, then remove the superseded single-column constraint after validation.
6. Roll out the cyclic Film cover relationship safely: insert a roll with a null cover, insert its photo, then update the roll to reference that photo. Test cover deletion and roll deletion explicitly.
7. Keep application ownership checks, but treat database constraints as the final boundary.

### Verification

- All current mismatch queries remain zero.
- A test write referencing another user's parent fails at the database layer.
- Valid same-user writes continue to work.

---

## 9. Finance Domain Constraints Are Incomplete

**Priority:** High
**Live evidence:** Live checks, foreign keys, and aggregate data counts

### 9.1 Transfers remain valid in the live database

Both `finance_transactions.direction` and `finance_rules.direction` currently allow:

```text
expense, income, transfer
```

There is one live transfer transaction and zero transfer rules.

#### Suggested action

- Decide whether transfers remain part of the product model.
- If transfers are being removed, export or transform the existing transfer transaction before changing the check constraint.
- Do not silently delete the row merely to make the new constraint pass.
- Add the restricted check only after the data decision is complete.

### 9.2 Candidate matched rules are not referentially constrained

`finance_candidate_transactions.matched_rule_id` is a nullable UUID with no foreign key. There are currently zero references to missing rules.

#### Suggested action

- Add a foreign key to `finance_rules(id)`.
- Use `ON DELETE SET NULL` if rule history may be deleted while candidates must remain.
- Prefer a tenant-safe composite relationship if the rule and candidate both retain `user_id`. On PostgreSQL 17, use column-specific `ON DELETE SET NULL (matched_rule_id)` so deleting a rule does not also null the candidate's non-null `user_id`.

### 9.3 Candidate confidence is unbounded

`confidence` has no check constraint. There are currently zero values outside `0..1`.

#### Suggested action

Add:

```sql
check (confidence is null or confidence between 0 and 1)
```

### Verification

- The transfer decision is documented and the live row is preserved or deliberately transformed.
- Missing matched-rule references cannot be inserted.
- Confidence values below zero or above one are rejected.

---

## 10. API-Key Hash Is Unindexed and Lifecycle Controls Are Absent

**Priority:** Medium hardening and design
**Live evidence:** Live table columns and indexes

`api_keys` currently stores:

- `id`
- nullable `user_id`
- `key_hash`
- `name`
- `created_at`
- `last_used_at`

There is no unique or lookup index on `key_hash`. The current database has zero duplicate hash groups. A unique lookup index is appropriate only while the authentication design uses a deterministic hash; a future salted password-hash design would require a separate stable lookup fingerprint.

The table also has no native expiry, revocation state, or immutable scope definition. These are recommended lifecycle controls, not findings emitted by the current Supabase Security Advisor.

### Suggested action

1. Make `user_id` non-null.
2. Confirm the hash scheme, then add a unique index on the deterministic `key_hash` or on a separate stable fingerprint.
3. Add `expires_at` and `revoked_at`.
4. Add explicit scopes or module permissions if one API key should not inherit every capability of its user.
5. Add a safe display prefix or fingerprint instead of ever returning the hash.
6. Update `last_used_at` consistently after successful authentication.
7. Rate-limit failed key authentication and record audit events.

### Verification

- Duplicate key hashes cannot be inserted.
- Expired and revoked keys are rejected.
- A scoped key cannot call an unrelated module.
- Key listings never expose `key_hash`.

---

## 11. Film Cover Storage Is Public and Unrestricted

**Priority:** Medium privacy and abuse prevention
**Live evidence:** `storage.buckets` and `pg_policies`

The live `film-covers` bucket has:

| Setting | Value |
|---|---|
| Public | `true` |
| File-size limit | none |
| Allowed MIME types | none |
| Storage policies | none |
| Current objects | 0 |

Because the bucket is empty, this is the safest time to change the design without migrating existing objects or breaking public URLs.

### Suggested action

- Make the bucket private unless permanent public access is an explicit product requirement.
- Serve short-lived signed URLs or an authenticated proxy.
- Set a conservative per-bucket file-size limit.
- Restrict MIME types to the exact image formats accepted by the product.
- Add owner-path Storage policies if authenticated clients upload directly.
- Add object cleanup for replaced or deleted covers.
- Validate actual file signatures or re-encode images rather than trusting only the supplied MIME header.

### Verification

- Unauthenticated object downloads fail after an object is uploaded in a test environment.
- Authorized signed URLs work and expire.
- Oversized or disallowed files are rejected by Storage itself.
- Replacing a cover removes the previous object.

References:

- [Creating buckets and restricting uploads](https://supabase.com/docs/guides/storage/buckets/creating-buckets#restricting-uploads)
- [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)

---

## 12. Leaked-Password Protection Is Disabled

**Priority:** Medium
**Live evidence:** Supabase Security Advisor

Supabase Auth leaked-password protection is disabled. This allows users to choose passwords known to have appeared in public credential breaches.

### Suggested action

- Enable leaked-password protection in Supabase Auth settings.
- Review minimum password length and complexity settings at the same time.
- Keep rate limiting and MFA requirements proportionate to the application's sensitivity.

### Verification

- The Security Advisor warning disappears.
- A known-compromised test password is rejected in a safe test flow.

Reference: [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

---

## 13. Trigger Function Has a Mutable Search Path

**Priority:** Medium
**Live evidence:** Supabase Security Advisor lint `0011`

`public.update_tickets_updated_at()` has no fixed search path. It is a normal invoker trigger function, not a `SECURITY DEFINER` function, so the immediate risk is lower than the Finance RPC. Fixing it removes name-resolution ambiguity and clears the advisor warning.

Only `tickets` currently has an automatic `updated_at` trigger. Other mutable tables rely on callers to maintain timestamps.

### Suggested action

- Set the trigger function search path to an empty value.
- Consider a shared, hardened `updated_at` trigger for other tables that expose an `updated_at` column.
- Do not overwrite caller-supplied timestamps unless that is the documented database contract.

### Verification

- Advisor lint `0011` disappears.
- Ticket updates still change `updated_at`.
- Any new shared triggers update timestamps exactly once per mutation.

Reference: [Advisor lint 0011](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

---

## 14. Twenty Foreign Keys Lack Covering Indexes

**Priority:** Medium performance
**Live evidence:** Supabase Performance Advisor lint `0001`

| Table | Foreign key without a covering index |
|---|---|
| `BRIDGE_role_modules` | `app_role_modules_module_id_fkey` |
| `BRIDGE_user_roles` | `app_user_roles_role_id_fkey` |
| `api_keys` | `api_keys_user_id_fkey` |
| `app_user_module_overrides` | `app_user_module_overrides_module_id_fkey` |
| `film_photos` | `film_photos_user_id_fkey` |
| `film_rolls` | `film_rolls_cover_photo_id_fkey` |
| `finance_candidate_transactions` | `finance_candidate_transactions_intake_item_id_fkey` |
| `finance_candidate_transactions` | `finance_candidate_transactions_user_id_fkey` |
| `finance_corrections` | `finance_corrections_intake_item_id_fkey` |
| `finance_corrections` | `finance_corrections_transaction_id_fkey` |
| `finance_processing_events` | `finance_processing_events_user_id_fkey` |
| `finance_rule_suggestions` | `finance_rule_suggestions_category_id_fkey` |
| `finance_rules` | `finance_rules_category_id_fkey` |
| `finance_rules` | `finance_rules_source_id_fkey` |
| `finance_rules` | `finance_rules_user_id_fkey` |
| `finance_transactions` | `finance_transactions_intake_item_id_fkey` |
| `notes` | `notes_project_id_fkey` |
| `projects` | `projects_user_id_fkey` |
| `tickets` | `tickets_project_id_fkey` |
| `tickets` | `tickets_user_id_fkey` |

Missing child-side indexes can slow joins and parent deletes or updates as the tables grow.

### Suggested action

1. Design the tenant-safe composite foreign keys first.
2. Add indexes that cover those final composite columns instead of creating temporary duplicate indexes.
3. Prefer indexes that also match actual filters and ordering where possible.
4. Re-run the advisor after each index migration.

### Verification

- Performance Advisor lint `0001` clears for the intended constraints.
- Query plans use the new indexes for representative joins and deletes.
- No redundant indexes cover the same leading columns without a workload justification.

Reference: [Advisor lint 0001](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)

---

## 15. Sixteen RLS Policies Re-Evaluate `auth.uid()` Per Row

**Priority:** Medium performance
**Live evidence:** Supabase Performance Advisor lint `0003`

All four ownership policies on each of these tables are affected:

- `projects`
- `daily_logs`
- `tickets`
- `finance_sources`

Affected operations are `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, for a total of 16 findings.

The current policies call:

```sql
auth.uid()
```

directly in the row expression. Supabase recommends:

```sql
(select auth.uid())
```

so the value is initialized once per statement rather than recalculated for every row.

### Suggested action

- Recreate all 16 policies using `(select auth.uid())`.
- Scope them explicitly with `TO authenticated`.
- Combine the optimization with the final RBAC decision so policies are rewritten only once.
- Preserve both `USING` and `WITH CHECK` ownership guarantees for updates.

### Verification

- Performance Advisor lint `0003` disappears.
- Policy behavior remains identical in positive and negative RLS tests.
- Query plans no longer show per-row auth helper initialization.

Reference: [Advisor lint 0003](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0003_auth_rls_initplan)

---

## 16. Seven Indexes Are Reported Unused

**Priority:** Low; observe before changing
**Live evidence:** Supabase Performance Advisor lint `0005`

| Table | Index |
|---|---|
| `finance_sources` | `finance_sources_user_id_idx` |
| `finance_transactions` | `finance_transactions_source_id_idx` |
| `finance_transactions` | `finance_transactions_category_id_idx` |
| `finance_corrections` | `finance_corrections_user_id_idx` |
| `film_rolls` | `film_rolls_camera_id_idx` |
| `film_maintenance_records` | `film_maintenance_records_camera_id_idx` |
| `finance_processing_events` | `finance_processing_events_intake_idx` |

An unused-index notice is not a recommendation to drop the index immediately. Several listed indexes support foreign keys, and usage statistics may cover only a short or recently reset observation window.

### Suggested action

- Retain foreign-key-supporting indexes unless a replacement index covers the same leading columns.
- Observe production index usage over a representative period.
- Review query plans and write overhead before removing anything.
- Remove only indexes proven redundant after the composite ownership/index design is finalized.

### Verification

- Any removed index is covered by another suitable index or proven unnecessary.
- Parent deletes and common joins do not regress.
- Database write latency and storage improve measurably if an index is removed.

Reference: [Advisor lint 0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

---

## 17. Additional Domain and Schema Hardening

**Priority:** Low to Medium

These items were observed directly in the live schema but are not current Supabase Advisor warnings.

### Defaulted project fields remain nullable

`projects.priority`, `completed`, `archived`, `created_at`, and `updated_at` have defaults but remain nullable. This permits three-state booleans and records without timestamps.

**Suggested action:** backfill any future nulls and make fields non-null where null has no explicit business meaning.

### Monetary values are inconsistently constrained

Film processing, scanning, and shipping costs reject negative values, while `film_rolls.purchase_price` and `film_maintenance_records.maintenance_cost` do not.

**Suggested action:** add nonnegative checks if negative purchase and maintenance amounts are not legitimate adjustments.

### Quoted uppercase RBAC identifiers increase operational risk

The live database uses quoted mixed-case names such as `"DIM_roles"` and `"BRIDGE_user_roles"`. These names must be quoted exactly in SQL and are easier to reference incorrectly in migrations and tooling.

**Suggested action:** either standardize on lowercase snake_case through a carefully coordinated rename or document and consistently quote the current identifiers. Treat this as a planned compatibility migration, not an urgent production change.

### Broad default table grants make RLS the primary guard

`anon` and `authenticated` hold broad table privileges across the public schema. RLS currently prevents access to the 20 policy-free tables, but a future permissive policy could immediately expose them.

**Suggested action:** revoke unnecessary grants on server-only tables and add default-privilege rules for future objects.

---

## Implementation Plan

### Phase 1: Immediate security containment

1. Revoke public execution of `finance_refresh_rule_suggestions()`.
2. Set safe function search paths and default function privileges.
3. Enable leaked-password protection.
4. Re-run the Security Advisor.

### Phase 2: Authorization design

1. Choose direct Data API with database RBAC or server-only access.
2. Fix ticket/project tenant ownership.
3. Rebuild the four ownership-policy sets with `TO authenticated`, RBAC enforcement if required, and optimized auth helper calls.
4. Classify all 20 policy-free tables.
5. Add automated RLS tests.

### Phase 3: Integrity constraints

1. Re-run all aggregate preflight checks.
2. Make ownership columns non-null.
3. Add the daily-log user foreign key.
4. Add composite tenant-safe foreign keys.
5. Add Finance matched-rule and confidence constraints.
6. Preserve or transform the existing transfer transaction before restricting directions.
7. Add API-key uniqueness and lifecycle controls.

### Phase 4: Storage and performance

1. Make `film-covers` private and add restrictions while it is still empty.
2. Add indexes for the finalized foreign-key design.
3. Re-run the Performance Advisor.
4. Observe unused indexes before deciding whether to remove them.

### Phase 5: Reproducibility

1. Capture and review the live baseline.
2. Prove a clean rebuild locally or in a Supabase branch.
3. Reconcile migration tracking.
4. Require forward migrations and schema-diff validation in CI.

---

## Overall Definition of Done

The Supabase remediation is complete when:

- anonymous and ordinary authenticated roles cannot execute privileged maintenance functions
- ticket, Film, and Finance relationships cannot cross user boundaries
- module denials cannot be bypassed through the Data API
- every public table has an explicit and documented access model
- the live database can be reproduced from versioned migrations
- ownership columns and user references cannot become orphaned
- the existing transfer transaction has a deliberate preserved outcome
- API keys support uniqueness, revocation, expiry, and appropriate scopes
- Film covers are private or explicitly approved as public, with upload restrictions
- leaked-password protection is enabled
- missing foreign-key indexes and inefficient RLS expressions are resolved
- the Security and Performance Advisors contain no unexplained warnings
- automated database tests cover RLS, tenant boundaries, constraints, functions, and Storage access
