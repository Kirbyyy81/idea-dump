# IdeaDump

A Notion-inspired web app to centralize, track, and manage all your PRDs and project ideas.

## Features

- 📄 **Store PRDs** - Import and store PRDs in markdown format
- 🎯 **Auto Status** - Status auto-updates based on content and GitHub links
- 📝 **Notes** - Add journal entries to track progress
- 🔗 **API Access** - Send PRDs from external tools via API

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Magic Link
- **Hosting**: Vercel

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL schema in the SQL Editor (see `schema.sql` below)
3. Copy your project URL and keys
4. In **Authentication → URL Configuration**, set your Site URL and add redirect URLs for:
   - `http://localhost:3000/auth/callback` (local dev)
   - `https://YOUR_DOMAIN/auth/callback` (production)

### 3. Configure Environment

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Windows note (Git Bash)

If `npm` isn’t available in PowerShell (common in some locked-down environments), run build/lint via Git Bash using:

```powershell
.\scripts\npm-gitbash.ps1 run lint
.\scripts\npm-gitbash.ps1 run build
```

## Versioning

- `APP_VERSION` (shown in Settings) comes from `package.json` `version`. Increment it when you intentionally ship a release.
- `VERSION_CODE` (shown in Settings) is the per-deploy identifier (commit SHA on Vercel via `VERCEL_GIT_COMMIT_SHA`, or set `GIT_COMMIT_SHA` elsewhere).
- `LAST_UPDATED` (shown in Settings) defaults to build time (or set `BUILD_TIME`).

## GitHub Automation

- `.github/workflows/auto-pr-from-main.yml` runs on every push to `main`.
- Set the repository variable `AUTO_PR_BASE_BRANCH` to the branch that should receive the PR.
- The workflow pushes the latest `main` commit to `codex/auto-pr-main` and opens or reuses a PR from that branch into `AUTO_PR_BASE_BRANCH`.

## Database Schema

```sql
-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  prd_content TEXT,
  github_url TEXT,
  priority TEXT DEFAULT 'medium',
  tags TEXT[],
  completed BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);
```

## API Usage

```bash
curl -X POST https://your-app.vercel.app/api/ingest \
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
