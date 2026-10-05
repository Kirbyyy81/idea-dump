# Inventory Guide

- Keep shared validation, calculations, browser transport, authorization, service, and repository code under `core/`. Keep domain types in `lib/types.ts` and page-owned UI under `app/inventory/_components/`.
- Reuse `authorizeSessionModule('inventory')` and the existing server client. Finance expense discovery and linking additionally require Finance access. Keep application tables and RPCs inaccessible to browser database roles.
- Use `inventory_mutate` for stock writes. Preserve per-owner serialization, request-key conflict detection, atomic receipts, ownership filters, revisions, and nonnegative stock. Do not replace transactional operations with separate application queries.
- Preserve batch snapshots when products or variants change. Only unopened usable items contribute to shelf quantity. A tissue multipack expands into boxes before usage is tracked.
- Keep unknown prices and dates null. Exclude removed items and incomplete usage history from estimates. Count overlapping completed usage days once; compare countable variants only when their sheets-per-item values match.
- Run `npm run test:inventory`, `npm run test:inventory:db`, and `npm run test:inventory:browser`, followed by the root validation checks. The database suite uses an ephemeral PGlite instance with minimal dependency tables and the repository's actual module-access function and Inventory migration. It verifies SQL behavior and permissions; it does not reproduce a multi-session production database or the entire Supabase platform.
- Keep browser fixtures under `tests/browser/` and `tests/fixtures/`. Update `document/INVENTORY_MODULE.md` and PRD 16 when behavior or rollout requirements change.
