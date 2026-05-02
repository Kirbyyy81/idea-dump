# IdeaDump

IdeaDump is a Next.js app for keeping projects, writing weekly work logs, managing API keys, and handling lightweight role-based access in one place. It is built around a private workspace feel: sign in, open the modules you have access to, and manage work from a single dashboard.

## What The Project Includes

- Project tracking with create, edit, view, and delete flows
- Weekly productivity logs with filtering, editing, and markdown export
- API key management for external clients and agent-style workflows
- Access control for roles, module permissions, and per-user exceptions
- Small article-creation helper tools for content support tasks
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
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for auth and normal app usage.
- `SUPABASE_SERVICE_ROLE_KEY` is required for admin-style server operations such as API key management and access-control management.
- Optional build metadata can also be set if you want the Settings page to show custom version info:

```env
GIT_COMMIT_SHA=your-commit-sha
BUILD_TIME=2026-03-16T00:00:00.000Z
```

### 3. Prepare Supabase

Create a Supabase project and apply the SQL files in [document/migrations](D:\Ash Stuff\Coding\idea-dump\document\migrations) so the required tables, role mappings, and log structures exist.

You should also configure your Supabase auth redirect URLs, including:

- `http://localhost:3000/auth/callback`
- your deployed domain callback URL, for example `https://your-domain.com/auth/callback`

### 4. Run the app

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Windows note

If `npm` is easier to run through Git Bash on your machine, the repo includes a helper script:

```powershell
.\scripts\npm-gitbash.ps1 run dev
.\scripts\npm-gitbash.ps1 run lint
.\scripts\npm-gitbash.ps1 run build
```

## Important Routes

### App routes

- `/` redirects to login or dashboard depending on session state
- `/dashboard`
- `/projects`
- `/project/new`
- `/project/[id]`
- `/project/[id]/edit`
- `/logs`
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
- `/api/access/me`
- `/api/access/users`
- `/api/access/users/[userId]`
- `/api/access/roles`
- `/api/access/roles/[role]`

## Project Structure

- `app/`  
  App Router pages, layouts, and API route handlers.

- `components/`  
  Reusable UI pieces organized into atoms, molecules, and organisms.

- `lib/`  
  Shared types, auth helpers, RBAC logic, Supabase clients, logging helpers, utility functions, and article-creation utilities.

- `document/`  
  Product docs, design notes, and database migration files.

- `public/`  
  Static assets.

- `scripts/`  
  Small local helper scripts.

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
