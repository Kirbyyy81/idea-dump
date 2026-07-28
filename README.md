# IdeaDump

IdeaDump is a Next.js app for keeping projects, writing weekly work logs, managing API keys, and handling lightweight role-based access in one place. It is built around a private workspace feel: sign in, open the modules you have access to, and manage work from a single dashboard.

## What The Project Includes

- Project tracking with create, edit, view, and delete flows
- Weekly productivity logs with filtering, editing, and markdown export
- API key management for external clients and agent-style workflows
- Access control for roles, module permissions, and per-user exceptions
- Small article-creation helper tools for content support tasks
- Ticketing system for tracking project-related tasks and issues
- Film journal for analog photography tracking (cameras, rolls, canister themes)
- Finance tracking with screenshot OCR, review, rules, sources, categories, and transactions
- Android PWA share target for background Finance screenshot processing
- Interactive log viewer for system and productivity logs
- Supabase authentication with login, signup, callback, and password reset
- In-app API reference inside the API module

## Main Modules

The current app is organized around these modules:

- `Dashboard`  
  Landing area after login. It loads the modules the current user can access and links into them.

- `Projects`  
  Project list plus project detail and edit flows. Projects can include title, description, PRD content, GitHub URL, deploy URL, priority, notes, and archive/completion state.

- `Weekly Logs`  
  Create and review daily or weekly work entries, filter by date/source/search, and export a selected range to markdown.

- `API`  
  Generate and revoke API keys, review example usage, and browse the OpenAPI/Swagger reference. The old `/docs` route now redirects here.

- `Access Control`  
  Admin-facing module for role assignment, module access, and per-user allow/deny overrides.

- `Article Creation`  
  Small productivity helpers for article work, including minute-read estimation, slug/image-name generation, and table-of-contents anchor generation.

- `Tickets`  
  Ticketing system linked to projects, with statuses, priorities, and assignments.

- `Film Journal`  
  Analog film photography tracker to manage cameras, log rolls, and visualize film canisters with custom themes.

- `Finance`
  Transaction tracking with manual entry, screenshot OCR, review, duplicate detection, automatic rules, categories, sources, and background share batches.

- `Log Viewer`  
  Interactive viewer for logs and productivity entries.

- `Settings`  
  Profile details, sign-out flow, and version/build metadata.

## Local Setup

### 1. Install dependencies

```bash
npm install
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
- Optional build metadata can also be set if you want the Settings page to show custom version info:

```env
GIT_COMMIT_SHA=your-commit-sha
BUILD_TIME=2026-03-16T00:00:00.000Z
```

### 3. Prepare Supabase

The canonical Supabase configuration and forward migrations live in [`supabase`](./supabase). The reviewed live schema baseline is [`document/supabase/schema.sql`](./document/supabase/schema.sql); its SHA-256 is recorded by the first canonical migration.

- For the existing production project, apply only unapplied forward migrations. The baseline marker is intentionally a no-op and must not replay the exported schema over production.
- For a fresh project, restore the schema-only baseline first, then apply the later canonical migrations in timestamp order. Do not run the remediation migrations against an empty database.
- Treat the older files in [`document/migrations`](./document/migrations) as historical records rather than the current migration ledger.

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

## Finance Share Target

The share target is supported by the installed Android PWA. On iPhone and iPad, use the Finance screenshot upload because the current project does not include a native iOS Share Extension.

1. Select up to 10 screenshots in another app and choose `Share` then `IdeaDump`.
2. Review the received PNG, JPEG, or WebP images. Each file must be 4 MB or smaller.
3. Remove unwanted or invalid files, then select `Process images`.
4. IdeaDump replaces any earlier active share batch, uploads the files to private Supabase Storage, verifies them, and queues Render OCR.
5. After the `Images queued` popup appears, the user may leave the app. Dismissing the popup keeps the current batch status visible.
6. Results are added automatically, sent to Finance Review, marked as duplicates, or marked as failed.

Temporary share images and batch records are removed after terminal processing and verified Storage cleanup.

## Important Routes

### App routes

- `/` redirects to login or dashboard depending on session state
- `/dashboard`
- `/projects`
- `/project/new`
- `/project/[id]`
- `/project/[id]/edit`
- `/logs`
- `/log-viewer`
- `/tickets`
- `/tickets/new`
- `/tickets/manage`
- `/film`
- `/finance`
- `/finance/add`
- `/finance/transactions`
- `/finance/review`
- `/finance/sources`
- `/finance/categories`
- `/finance/rules`
- `/api-tools`
- `/docs` redirects to `/api-tools`
- `/settings`
- `/settings/access`
- `/article-creation`
- `/login`
- `/signup`
- `/reset-password`
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

## Project Structure

- `app/`  
  App Router pages, layouts, and API route handlers.

- `components/`  
  Reusable UI pieces organized into atoms, molecules, and organisms.

- `lib/`  
  Shared types, auth helpers, RBAC logic, Supabase clients, logging helpers, utility functions, and article-creation utilities.

- `document/`
  Product docs, design notes, and database migration files. Start new product requirements with [`document/PRD_TEMPLATE.md`](./document/PRD_TEMPLATE.md).

- `public/`  
  Static assets.

- `scripts/`  
  Small local helper scripts.

- `services/finance-ocr/`
  Render service for direct Finance OCR and durable share-batch processing.

- `supabase/`
  Supabase configuration and canonical forward migrations.

## Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase Auth and database
- React Markdown
- Swagger UI loaded in the API module

## License

MIT
