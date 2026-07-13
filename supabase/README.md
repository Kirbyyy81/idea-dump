# Supabase Migration Runbook

This directory is the canonical forward-migration ledger for the live IdeaDump Supabase project.

The first three files were reconstructed from the statements and versions stored
in the live `supabase_migrations.schema_migrations` table:

- `20260626034325_20260626_repair_rbac_modules.sql`
- `20260626065533_20260626_module_metadata.sql`
- `20260710081850_simplify_film_roll_statuses.sql`

Their versions must not be renamed or repaired in production.

## Baseline

The schema-only production export is stored at `document/supabase/schema.sql`. The no-op baseline migration records its reviewed SHA-256:

```text
AB822079B6BDDE9E8A0995C7D75FBA9089BB592EE46F67A1DD0DC929C2E35F57
```

Do not execute that export over the existing production database. For a fresh
database, restore the export first and then apply the remediation migrations
after the baseline marker. The archived dump was normalized from `CREATE SCHEMA
public` to `CREATE SCHEMA IF NOT EXISTS public` so it can be loaded into a fresh
Supabase project without dropping platform-managed objects from the existing
`public` schema.

This is an adopted-baseline workflow, so `supabase db reset` is not standalone:
an empty database must receive `document/supabase/schema.sql` before the baseline
and forward migrations are applied. The baseline deliberately fails to replace
the production schema with a second copy.

## Rollout order

`supabase db push` applies every pending migration; it cannot pause between the
Finance contract and final access enforcement. Use one traffic-drained cutover:

1. Prepare and verify the compatible application build before touching the database.
2. Confirm a usable data backup or explicitly accept that the schema-only export cannot recover user rows.
3. Put the application into maintenance mode or otherwise drain user traffic.
4. Link the CLI, compare migration history, and review `supabase db push --dry-run`.
5. Run one `supabase db push` containing every reviewed pending migration.
6. Deploy the compatible application while traffic remains drained.
7. Smoke-test Auth, RBAC, Finance, Film covers, Projects, Tickets, Notes, logs, and API keys.
8. Re-run Supabase security/performance advisors and the verification queries in `document/SUPABASE_AUDIT_20260712.md`.
9. Resume traffic only after all checks pass.

Deploy these versioned files with the Supabase CLI, not the MCP
`apply_migration` operation. MCP assigns a new execution-time version, whereas
`supabase db push` records each filename timestamp and skips the three historical
versions that are already present remotely:

```powershell
supabase link --project-ref xcaxukhjkqqnmzziqrkc
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

Review the dry run and confirm that only the intended pending versions appear.
Do not use `migration repair` merely to make a mismatched list look clean; it
changes migration history without applying SQL.

The Finance migration changes RPC contracts and the enforcement migration
revokes browser access to application tables. The old application is not a safe
rollback after the push. If application deployment fails, keep maintenance mode
enabled and roll forward with the compatible build; do not reopen traffic on the
old build or issue broad emergency grants without a separately reviewed incident
plan.

## Hosted-platform limitation

The hosted migration role can secure `postgres` default privileges but cannot administer the internal `supabase_admin` role. The enforcement migration therefore guards that operation and emits a notice on hosted Supabase. Current public-schema objects are still explicitly revoked and all user-created public objects are currently owned by `postgres`.

The `film-covers` bucket is private and currently has no `storage.objects` policies. Any future Storage policy must explicitly exclude `bucket_id = 'film-covers'`; otherwise a broad authenticated policy could bypass the application proxy. The hosted `postgres` migration role does not own `storage.objects`, so this boundary is recorded here instead of adding an unexecutable policy migration.

Film object deletion remains best-effort by product decision. Replaced or failed
uploads are removed immediately when possible, but there is no durable cleanup
outbox in v1. Keep the bucket private and periodically compare
`storage.objects.name` with `film_rolls.cover_image_path`; review any orphan
before deleting it.

Confirmed Finance ledger updates and deletes are RPC-only application
operations. Use `finance_update_transaction` and `finance_delete_transaction`;
an ad hoc service-role `DELETE` bypasses screenshot-lineage and duplicate-state
cleanup even though browser roles cannot perform it. Candidate duplicate-target
writes and trusted RPC mutations share the fail-fast per-user ledger lock.
