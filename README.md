# IdeaDump

IdeaDump is a Next.js app for managing product ideas, PRDs, and lightweight delivery logs in one place. It combines a project workspace, markdown-based PRD storage, personal API keys, and a weekly productivity log with export support.

## Current Features

- Project dashboard with search and status filters
- Create, edit, archive, and review projects
- Markdown PRD storage and rendering
- Project notes for ongoing context and updates
- Status inference from project metadata:
  - `Ideation` when a project has no GitHub or deploy URL
  - `Development` when a GitHub URL is present
  - `Deployed` when a deploy URL is present
  - `Archived` when a project is archived
- Weekly productivity log with:
  - manual entry creation
  - agent vs human source tracking
  - edit and delete support
  - date-range, source, and text filtering
  - markdown export with clipboard copy
- API key management from the Settings page
- API ingestion endpoint for creating projects from external tools
- In-app API documentation via Swagger UI at `/docs`
- Supabase magic-link auth with signup, login, callback, and reset-password flows

## Repo Overview

- `app/`: Next.js App Router pages and API routes
- `components/`: atomic-design UI components
- `lib/`: Supabase clients, shared types, OpenAPI helpers, auth cache, and utilities
- `document/`: product docs and SQL migrations
- `scripts/`: local helper scripts, including Windows Git Bash npm wrapper

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL
- Swagger UI for API docs
- Vercel-friendly build metadata and deployment flow

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in your Supabase values:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Optional build metadata:

```env
GIT_COMMIT_SHA=your-commit-sha
BUILD_TIME=2026-03-16T00:00:00.000Z
```

### 3. Prepare Supabase

Create a Supabase project, then apply the project schema and migrations used by this repo.

- Core project and note tables are documented below in this README.
- Daily log support is defined in `document/migrations/20260316_daily_logs.sql`.

In Supabase Auth URL configuration, add:

- `http://localhost:3000/auth/callback`
- `https://YOUR_DOMAIN/auth/callback`

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Windows note

If `npm` is not available in PowerShell, use the helper script:

```powershell
.\scripts\npm-gitbash.ps1 run lint
.\scripts\npm-gitbash.ps1 run build
```

## Available Routes

### App pages

- `/dashboard`: main project list with filters
- `/project/new`: create a project
- `/project/[id]`: project detail view
- `/project/[id]/edit`: edit an existing project
- `/logs`: weekly productivity log
- `/docs`: interactive API docs
- `/settings`: API keys, profile, and version footer
- `/login`, `/signup`, `/reset-password`: auth flows

### API routes

- `POST /api/ingest`: create a project from an external tool using an API key
- `GET /api/projects`: list projects
- `GET|POST|DELETE /api/keys`: manage API keys
- `GET|POST /api/logs`: list and create daily log entries
- `PATCH|DELETE /api/logs/[id]`: update or delete a log entry
- `POST /api/export/weekly`: export logs as markdown
- `GET /api/openapi`: OpenAPI spec consumed by the docs page
- `GET|POST /api/notes`: note management

## Versioning And Releases

- `APP_VERSION` is sourced from `package.json` and shown in Settings.
- `VERSION_CODE` is derived from `NEXT_PUBLIC_VERSION_CODE`, `VERCEL_GIT_COMMIT_SHA`, `GIT_COMMIT_SHA`, or local git state.
- `LAST_UPDATED` is derived from `NEXT_PUBLIC_LAST_UPDATED`, `BUILD_TIME`, or the build timestamp.
- GitHub release automation is handled by `release-please` on pushes to `main`.
- Commit messages merged into `main` should follow Conventional Commits so version bumps stay predictable.

## GitHub Automation

- `.github/workflows/auto-pr.yml` opens a PR into `main` when a non-`main` branch is pushed and no PR already exists.
- `.github/workflows/release-please.yml` runs on pushes to `main` and manages release PRs, semantic version bumps, tags, and GitHub Releases.

## Database Schema

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  prd_content TEXT,
  github_url TEXT,
  deploy_url TEXT,
  priority TEXT DEFAULT 'medium',
  tags TEXT[],
  completed BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('agent', 'human')),
  content JSONB NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);
```

## API Example

```bash
curl -X POST https://idea-dump-alpha.vercel.app/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "title": "My New PRD",
    "prd_content": "# PRD Content...",
    "tags": ["ai", "web"]
  }'
```

## License

MIT
