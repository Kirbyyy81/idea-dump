# Inventory Module

PRD: [PRD 016](prd/PRD_016.md). Entry point: `/inventory`. The Inventory parent opens the shelf at `/inventory`. Its two sidebar submodules are **Purchases** (`/inventory/purchases`) and **Usage history** (`/inventory/usage`); the shelf is not repeated in the submenu. Each has its own URL and page title, supports refresh and browser history, and inherits Inventory access. On mobile, open navigation to switch submodules.

## Workflow

Create a product with a required category, optional subcategory, and size or pack variants, then receive repeat purchases through **Add stock**. The receiving cart supports several products, editable quantities, per-purchased-unit or line-total MYR prices, and one purchase date. **Add to shelf** confirms the complete receipt. Products can also be created directly inside the cart, which preserves its existing lines.

**Existing stock** allows unknown purchase dates and prices and individual items already in use, with an optional usage start date. Two five-box tissue packs become ten usable boxes. Opening the outer packaging is not a usage event.

Subcategory choices come from products in the selected category. Choose **Add subcategory** to type a new name in the same field, which receives focus without adding a form row. The arrow returns to the existing choices while retaining the typed name. Choose **None** to leave it blank. Changing category clears the subcategory. The shelf category filter enables a matching subcategory filter; changing the filter category resets that filter. Existing products keep their categories and initially have no subcategory.

**My Shelf** shows unopened quantities and a separate in-use count. Hover over a quantity for a brief breakdown, or activate it by touch or keyboard for product details. Product details include historical batches, prices, usage records, and adjustments. Products remain in the catalogue at zero stock.

**Start using** removes one usable item from unopened stock and starts its usage record. **Finished** closes it; **Edit dates** corrects late or mistaken entries. Stock adjustments record corrections, discarded items, losses, and gifts separately from consumption. Positive corrections do not change original purchase quantities or costs.

## Calculation rules

- Volume uses ml, weight uses g, and count uses individual usable items. An opened item never contributes to unopened quantity or estimated duration.
- Each product represents one formulation. Create another product for a different formulation rather than treating it as another size.
- Estimates use all comparable finished records with known start and finish dates. Divide total consumed quantity by the union of recorded usage intervals. Overlapping days count once; gaps between intervals do not count. Same-day completion contributes one day. Divide unopened quantity by that observed daily rate and show approximate whole days.
- Countable variants are comparable only when their optional sheets-per-item values match, including an unspecified group. If any stocked group lacks usable history, show **No usage estimate yet** for the product. Compatible group durations are added together.
- Price history uses original purchase quantities and snapshot sizes. Usual price is total known spend divided by total comparable quantity, across all recorded purchases. Unknown prices are excluded; recorded zero prices remain valid but do not serve as percentage-change denominators.
- Compare measured products per 100 ml or 100 g, and countable products per individual item. The price checker uses a prospective price for one purchased pack and never changes stock.
- Dates use calendar dates in Asia/Kuala_Lumpur. Historical dates can be entered from 1900 onward; future dates and backwards usage intervals are rejected.

## Finance linking

Open a saved purchase from **Purchases** or product details and choose **Link Finance expense**. Search the owner's existing confirmed MYR expenses by merchant, with paged results. Linking needs both Inventory and Finance module access.

The link does not create an expense or overwrite Inventory prices. Different totals are valid when the Finance expense includes other shopping. Removing the link, or deleting the expense, leaves Inventory purchases and stock intact. Finance access is optional for every other inventory workflow.

## Data and access

`inventory_products` and `inventory_variants` store the reusable catalogue. `inventory_purchases` groups confirmed carts. `inventory_batches` holds each purchase line, its immutable product/size snapshot and editable receipt cost, and its unopened count. `inventory_usages` tracks individual consumption; `inventory_adjustments` records corrections and removals. `inventory_requests` preserves mutation identities for safe retries.

All tables enable RLS and revoke browser-role access. The server uses the established admin client only after shared module authorization. `inventory_read` and `inventory_mutate` are security-invoker RPCs with an empty search path, executable only by the trusted service role. They recheck module access and scope all records to the verified user. Finance links also recheck Finance access and expense ownership.

Mutations serialize by owner, with one stable request UUID per form session, retained after an uncertain response even if the form is edited. Repeating the same committed payload returns its prior result. Reusing a committed key for a different payload fails instead of adding stock again. A bad receipt line rolls back the entire receipt. Product, purchase and usage revisions reject stale edits. Historical batch snapshots are independent of catalogue edits; tracking units cannot change once a product has purchase history.

The primary API is session-only `GET /api/inventory` and `POST /api/inventory`. Mutation bodies contain `request_id`, `action`, and `payload`. Expense discovery is `GET /api/inventory/expenses?q=...&page=...`. No user-supplied identity controls ownership. These endpoints are not API-key endpoints.

## Rollout

1. The forward migration [20261005075806_add_inventory_stock_keeping.sql](../supabase/migrations/20261005075806_add_inventory_stock_keeping.sql) was applied to the connected Supabase project on 2026-10-05. For other environments, apply it once through migration deployment.
2. Deploy the application build containing `/inventory` and its API routes.
3. Verify Inventory appears for the owner. The migration adds its module metadata and owner-role grant; other access remains configurable through the existing access controls.

No new environment variables, storage buckets, external services, or scheduled jobs are required. The hosted database migration is complete; application deployment remains pending. The local migration filename matches the version assigned by Supabase during application, with its SQL contents unchanged.

For a rollback, disable Inventory in the module catalogue or revert the application release. Preserve its tables and history. Do not replay the schema baseline or drop stock records.

## Verification

With the root Node version and dependencies installed:

```powershell
npm run test:inventory
npm run test:inventory:db
npm run test:inventory:browser
```

The SQL suite starts a disposable PGlite PostgreSQL instance with minimal dependency tables, the real module-access function, and the Inventory migration. It verifies transaction rollback, retry identities, ownership, role grants, RLS enablement, revisions, historical snapshots, and Finance links. It requires no local database server or project credentials. PGlite does not reproduce multi-session lock contention; validate that behavior against a staging PostgreSQL deployment before high-concurrency use.

Browser tests use the real Inventory UI with isolated API fixtures on desktop and mobile. They exercise shelf breakdowns, price checks, cart retries, product creation inside a cart, initial stock, starting and finishing items, and Finance links. These do not replace a hosted smoke test after migration rollout.

The root `npm test` command also runs the Inventory SQL suite, so the existing CI application-test step covers it. Complete the root audit, lint, TypeScript, test, and build checks. Changes to `lib/types.ts` also require the Finance OCR checks because that service imports the shared types.

### Validation record, 2026-10-05

- Root lint, TypeScript, service-worker checks, and production build passed using Node 22.22.0.
- All 673 Vitest tests across 91 files passed with `vitest run --maxWorkers=2`. A concurrent build/test run had timed out in four existing UI tests; the reduced-concurrency rerun passed without changing their assertions or timeouts.
- All 39 focused Inventory unit/API tests and 14 desktop/mobile browser cases passed. The two cart/product transition cases passed again after the final focus refinement.
- The isolated Inventory PostgreSQL suite passed, including atomic rollback, immutable snapshots, retry identities, ownership, module overrides, role permissions, and Finance links.
- Root production audit passed with zero vulnerabilities. The full root audit reports seven existing high-severity development dependency findings through `braces`, Tailwind, and Next.js lint tooling. The Inventory dependency addition does not change those dependency versions.
- Finance OCR typecheck, build, and tests passed (387 passed, 171 existing skipped). Its full and production audits report one existing high-severity `@fastify/busboy` dependency finding. OCR package files were not changed by this feature.
- Follow-up on 2026-10-05: applied the Inventory migration to the connected hosted database and verified enabled module metadata, owner access, all seven tables with RLS enabled and browser-role reads revoked, and a successful owner inventory read. Application deployment remains pending.
- Security advisors report informational no-policy notices for the server-only Inventory tables, consistent with their revoked browser grants. Existing project warnings remain for [pg_net in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Submodule navigation verification, 2026-10-05

- All 42 Inventory unit/API/page-access tests, the isolated PostgreSQL suite, and 16 desktop/mobile browser cases passed. Coverage includes direct URLs, refresh, browser back/forward, and the existing stock workflows.
- Verified the hosted-data local preview shows the Inventory group and opens Purchases from the mobile navigation.

### Subcategory rollout, 2026-10-05

Applied [20261005092513_add_inventory_subcategory.sql](../supabase/migrations/20261005092513_add_inventory_subcategory.sql) to the connected Supabase project. It adds nullable product subcategories and updates transactional product saves. Verified the column, owner read, RLS, and revoked browser grants. Older direct mutation payloads preserve a subcategory when category is unchanged, and clear it when category changes. Blank values normalize to null; names are limited to 60 characters.

Subcategory verification: 47 focused Inventory tests, all 681 application tests, isolated PostgreSQL classification and compatibility checks, and desktop/mobile browser coverage passed. Finance OCR typecheck, build, and tests also passed (387 passed, 171 existing skipped). Existing dependency audit and Supabase advisor findings above remain unchanged.

### Purchase corrections and notifications, 2026-10-05

Choose **Edit purchase** from Purchases or a product's purchase history. The editor includes every line in that receipt and allows corrections to stock source, purchase date, purchased quantities, and MYR line totals. Existing stock can retain unknown dates and prices. Historical products, sizes and pack contents remain fixed; receive additional shopping through Add stock.

Quantity changes apply only the difference to unopened stock. Usage and adjustment records remain intact, and corrections cannot make stock negative or put a purchase after recorded usage or adjustments. Purchase revisions reject stale editors, and retries keep their original request identity. Editing does not change the Finance link or its expense.

Successful Inventory actions use the shared Finance Toast, including dismissal and automatic expiry, instead of an inline confirmation row.

Applied [20261005100717_edit_inventory_purchases.sql](../supabase/migrations/20261005100717_edit_inventory_purchases.sql) to the connected Supabase project. Verified the purchase revision default, edit action, owner read and unchanged server-only access boundary. Apply this migration before deploying the purchase editor to other environments.

Verification: 57 focused Inventory tests, 691 application tests, isolated PostgreSQL checks and all 22 desktop/mobile browser cases passed. Root lint, TypeScript and production build passed. Finance OCR typecheck, build and tests passed (387 passed, 171 existing skipped). Dependency audit findings and Supabase advisor findings remain as documented above. Verified the rebuilt local preview opens the existing purchase editor with its original values; no user purchase was changed during verification.
