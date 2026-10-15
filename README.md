# IdeaDump

IdeaDump is a private workspace for projects, weekly work logs, tickets, personal finance, inventory, film photography, and developer tools. It runs on Next.js 15 and React 19, with Supabase authentication and role-based module access. Sign in to open the modules available to your account from one dashboard.

## What The Project Includes

- Project tracking with create, edit, view, and delete flows
- Weekly productivity logs with filtering, editing, and markdown export
- API key management for external clients and agent-style workflows
- Access control for roles, module permissions, and per-user exceptions
- Small article-creation helper tools for content support tasks
- Ticketing system for tracking project-related tasks and issues
- Film journal for analog photography tracking (cameras, rolls, canister themes)
- Finance tracking with budgets, screenshot OCR, review, rules, sources, categories, and transactions
- Personal inventory with receiving, consumption history, and purchase-price comparisons
- Android PWA share target for background Finance screenshot processing
- Browser-local Yes Shop and USSP log parsing, request/response pairing, and JSON inspection
- Code 128 barcode generation for case-sensitive alphanumeric identifiers
- Read-only access to the private Notion Document Hub
- Native Android companion for Finance notification capture and Android Auto lyrics
- Supabase authentication with login, signup, callback, and password reset
- In-app API reference under Settings

## Main Modules

The current app is organized around these modules:

- `Dashboard`  
  Landing area after login. It loads the modules the current user can access and links into them.

- `Projects`  
  Project list plus project detail and edit flows. Projects can include title, description, PRD content, GitHub URL, deploy URL, priority, notes, and archive/completion state.

- `Weekly Logs`  
  Create and review daily or weekly work entries, filter by date/source/search, and export a selected range to markdown.

- `API Tools`
  Generate and revoke API keys, review example usage, and download the Weekly Log skill from the Logs module.

- `Access Control`  
  Admin-facing module for role assignment, module access, and per-user allow/deny overrides.

- `Article Creation`  
  Small productivity helpers for article work, including minute-read estimation, slug/image-name generation, and table-of-contents anchor generation.

- `Tickets`  
  Ticketing system linked to projects, with statuses, priorities, and assignments.

- `Film Journal`  
  Analog film photography tracker to manage cameras, log rolls, and visualize film canisters with custom themes.

- `Finance`
  MYR transaction tracking with manual entry, screenshot OCR, review, duplicate detection, automatic rules, categories, sources, recurring budgets, and background share batches. See [Finance behavior and rollout](document/FINANCE_MODULE.md).

- `Inventory`
  Personal essentials catalogue, receiving cart, unopened shelf quantities, consumption history, price comparisons, and optional Finance expense links. See [Inventory setup and calculations](document/INVENTORY_MODULE.md).

- `Log Viewer`  
  Parse Yes Shop, USSP, and generic logs locally, inspect correlated requests and responses, and explore structured payloads. The parent navigation item opens the viewer; Barcode Generator is its only submenu. See [Log Viewer](#log-viewer).

- `Documentation`: Read and search the current private Notion Document Hub. Notion projects are optional read-only labels and are independent of app projects. See [Notion viewer setup](document/NOTION_VIEWER_SETUP.md).

- `Settings`  
  Profile details, sign-out flow, version/build metadata, access administration, and the OpenAPI/Swagger reference.

## Local Setup

### 1. Install dependencies

Use Node.js **22.22.0**, pinned in `.nvmrc`, for both the web app and Finance OCR service. With `nvm` installed:

```bash
nvm install
nvm use
npm ci
```

### 2. Create local environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase values:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
APP_ORIGIN=https://idea-dump-alpha.vercel.app
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_FINANCE_OCR_URL=https://your-finance-ocr-service.onrender.com
FINANCE_QUEUE_WAKE_SECRET=replace-with-at-least-32-random-bytes
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used by the browser for Supabase Auth only.
- `SUPABASE_SERVICE_ROLE_KEY` is required by trusted server routes for all application-table access. Never expose it to browser code.
- `APP_ORIGIN` is the trusted absolute origin used for production Auth redirects. Production defaults to `https://idea-dump-alpha.vercel.app`, but the environment value should be set explicitly and updated with any domain change.
- `NEXT_PUBLIC_FINANCE_OCR_URL` is the public Render Finance OCR origin without a trailing slash.
- `FINANCE_QUEUE_WAKE_SECRET` is a server-only secret shared by Vercel and Render. Use the same random value of at least 32 bytes in both environments.
- `NOTION_API_TOKEN` and `NOTION_DOCUMENTS_DATA_SOURCE_ID` configure the separate server-only, read-only Documentation integration. See [Notion viewer setup](document/NOTION_VIEWER_SETUP.md).
- Optional build metadata can also be set if you want the Settings page to show custom version info:

```env
GIT_COMMIT_SHA=your-commit-sha
BUILD_TIME=2026-03-16T00:00:00.000Z
```

### 3. Prepare Supabase

The canonical Supabase configuration and forward migrations live in [`supabase`](./supabase). The reviewed live schema baseline is [`supabase/schema.sql`](supabase/schema.sql); the first canonical migration records the reviewed source export hash.

- For the existing production project, apply only unapplied forward migrations. The baseline marker is intentionally a no-op and must not replay the exported schema over production.
- For a fresh project, restore the schema-only baseline first, then apply the later canonical migrations in timestamp order. Do not run the remediation migrations against an empty database.

You should also configure your Supabase auth redirect URLs, including:

- `http://localhost:3000/auth/callback`
- your deployed domain callback URL, for example `https://your-domain.com/auth/callback`

### 4. Run the app

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

For local Finance OCR requests, add `http://localhost:3000` to the Render service `ALLOWED_ORIGINS` value.

### Windows note

If `npm` is easier to run through Git Bash on your machine, the repo includes a helper script:

```powershell
.\scripts\npm-gitbash.ps1 run dev
.\scripts\npm-gitbash.ps1 run lint
.\scripts\npm-gitbash.ps1 run build
```

## Continuous integration

[Validation](.github/workflows/validate.yml) detects changed files before scheduling the web, Finance OCR, and Android jobs. Existing pushes compare against the previous pushed commit; pull requests use their complete diff. The first push of a new branch compares against its merge base with the default branch.

| Changed files | Validation jobs |
| --- | --- |
| Web application, root dependencies/configuration, assets, service worker, tests, scripts, or database files | Web |
| `services/finance-ocr/` or `render.yaml` | OCR |
| Shared Finance OCR helpers, the imported Finance constants/rule matching/value/dashboard modules, `lib/types.ts`, or `shared/date.ts` | Web and OCR |
| `android/` | Android |
| `.nvmrc` or `.npmrc` | Web and OCR |
| The validation workflow or `.gitattributes` | All three |
| Root documentation or `document/` only | No application jobs |

Changes spanning multiple components run each affected job. Unaffected jobs remain visible as skipped and do not produce build artifacts. Manual `workflow_dispatch` runs skip change detection and validate all three projects. If change detection fails, all three validation jobs run conservatively. The job names and their existing audit, test, build, and APK upload steps stay the same. The workflow uses a commit-pinned [paths-filter action](https://github.com/dorny/paths-filter) to handle pull requests, new branches, deletions, and renames.

## Local validation

Run the web application checks from the repository root:

```bash
npm audit
npm audit --omit=dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm test` checks the generated service worker, runs the application unit and component tests, and runs the isolated Inventory database suite through PGlite. The production build also regenerates the service worker.

For Log Viewer and Barcode Generator changes, run the focused tests and desktop/mobile browser suites:

```bash
npm run test:log-viewer
npx playwright install chromium
npx playwright test tests/browser/log-viewer.spec.ts tests/browser/log-viewer-diagnostics.spec.ts tests/browser/barcode-generator.spec.ts
```

The browser tests use a local fixture server with synthetic data. They are separate from the GitHub Actions web job. Feature-specific validation and setup are documented in [Log Viewer](document/LOG_VIEWER.md), [Finance](document/FINANCE_MODULE.md), and [Inventory](document/INVENTORY_MODULE.md).

Validate OCR service changes from `services/finance-ocr/` with `npm ci`, both dependency audits, `npm run typecheck`, `npm test`, and `npm run build`. Android build and device checks are documented in [android/README.md](android/README.md).

## Log Viewer

Open `/log-viewer` to paste or upload logs. Parsing happens in the browser; log contents and parsing dictionaries are not uploaded or stored on a server.

- Detect Yes Shop and USSP records, retain unknown records, and pair requests, responses, and content using IDs and source-specific rules. Ambiguous content stays available for inspection.
- Inspect formatted, foldable JSON and open embedded JSON strings with **Show JSON**. Copy complete payloads or reveal the original raw records, including text surrounding extracted JSON.
- Search the timeline and standalone records, filter by source, endpoint, line type, and status, or use the error, orphan, unmatched, and unparsed summary filters.
- Review HTTP codes, timestamps, hosts, parse warnings, multiple associated responses, and grouped table dumps. Optional auth grouping and recorded session context help inspect authentication sequences.
- Jump from a line reference to its exact range in the original input. Uploads above 10 MiB are rejected; pastes and uploads above 250,000 characters require **Parse log**.

The only submenu, `/log-viewer/barcode-generator`, generates Code 128 barcodes locally after a short typing pause. It accepts ASCII letters and numbers, preserving case and leading zeros. Recent barcodes retains seven distinct successful values in user-scoped session storage, with separate recall and delete buttons. Deleting the displayed or pending value also clears its input and preview. Wide barcodes scroll without compression.

See [Log Viewer behavior, source rules, and validation](document/LOG_VIEWER.md) for pairing limits, session history behavior, and scanner acceptance requirements.

## Finance Share Target

The share target is supported by the installed Android PWA. On iPhone and iPad, use the Finance screenshot upload because the current project does not include a native iOS Share Extension.

1. Select up to 10 screenshots in another app and choose `Share` then `IdeaDump`.
2. Review the received PNG, JPEG, or WebP images. Each file must be 4 MB or smaller.
3. Remove unwanted or invalid files, then select `Process images`.
4. IdeaDump replaces any earlier active share batch, uploads the files to private Supabase Storage, verifies them, and queues Render OCR.
5. After the `Images queued` popup appears, the user may leave the app. Dismissing the popup keeps the current batch status visible.
6. Results are added automatically, sent to Finance Review, marked as duplicates, or marked as failed.

Temporary share images and batch records are removed after terminal processing and verified Storage cleanup.

### Service worker development

[`service-worker/sw.ts`](service-worker/sw.ts) is the editable service-worker source. It imports the shared Finance message protocol from [`lib/finance/share/protocol.ts`](lib/finance/share/protocol.ts). [`public/sw.js`](public/sw.js) is generated deployment output and must not be edited directly.

After changing the worker or its shared protocol, regenerate and verify the checked-in artifact:

```bash
npm run build:service-worker
npm run check:service-worker
```

The application build regenerates the worker before Next.js compilation. The root and Finance share test commands verify that the checked-in output has not drifted from its typed source.

## Important Routes

### App routes

- `/` opens the dashboard, with unauthenticated requests handled by the login middleware
- `/dashboard`
- `/projects`
- `/projects/new`
- `/projects/[id]`
- `/projects/[id]/edit`
- `/logs`
- `/logs/api-tools`
- `/api-tools` redirects to `/logs/api-tools` for the database-backed API module path
- `/log-viewer`
- `/log-viewer/barcode-generator`
- `/tickets`
- `/tickets/new`
- `/tickets/manage`
- `/film`
- `/film/dashboard`
- `/film/cameras`
- `/film/new-roll`
- `/film/rolls/[id]`
- `/finance`
- `/finance/add`
- `/finance/transactions`
- `/finance/transactions/edit`
- `/finance/review`
- `/finance/budgets`
- `/finance/settings` manages sources, categories, rules, and companion devices
- `/inventory`
- `/inventory/purchases`
- `/inventory/usage`
- `/documentation`
- `/documentation/[pageId]`
- `/companion/pair`
- `/settings`
- `/settings/access`
- `/settings/docs`
- `/article-creation`
- `/login`
- `/login/signup`
- `/login/forgot-password`
- `/login/reset-password`
- `/auth/callback`

### API routes

- `/api/projects`
- `/api/notes`
- `/api/logs`
- `/api/logs/[id]`
- `/api/export/weekly`
- `/api/keys`
- `/api/ingest`
- `/api/openapi`
- `/api/tickets`
- `/api/film/*`
- `/api/finance/*`
- `/api/inventory/*` and `/api/inventory`
- `/api/documentation/*` and `/api/documentation`
- `/api/companion/*`

## Project Structure

- `app/`  
  App Router pages, layouts, and API route handlers.

- `components/`  
  Reusable UI pieces organized into atoms, molecules, and organisms.

- `lib/`  
  Shared types, auth helpers, RBAC logic, Supabase clients, and domain logic for Finance, Inventory, Log Viewer, and other modules.

- `tests/`
  Unit and component tests, browser fixtures, and isolated database test support.

- `shared/`
  Utilities shared across application and service code.

- `document/`
  Product docs and design notes. Start new product requirements with [`document/prd/PRD_TEMPLATE.md`](document/prd/PRD_TEMPLATE.md).

- `public/`  
  Static assets.

- `scripts/`  
  Small local helper scripts.

- `services/finance-ocr/`
  Render service for direct Finance OCR and durable share-batch processing.

- `service-worker/`
  Typed PWA worker source used to generate `public/sw.js`.

- `android/`
  Native Finance notification and Android Auto lyrics companion.

- `supabase/`
  Supabase configuration, adopted schema baseline, supporting snapshot, and canonical forward migrations.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript with strict checking
- Tailwind CSS 3
- Supabase Auth and database
- Fastify, Tesseract.js, and Sharp for the Finance OCR service on Render
- JsBarcode for browser-local Code 128 generation
- Vitest, Testing Library, Playwright, and PGlite for validation
- Kotlin, Jetpack Compose, Room, WorkManager, and Media3 for the Android companion
- React Markdown
- Swagger UI loaded in Settings API Docs

## License

MIT

## Android companion

The native Android subproject lives in [android/](android/README.md). It targets Android 13 and newer; use JDK 17 and Android SDK 36. See its README for builds and device acceptance checks.
