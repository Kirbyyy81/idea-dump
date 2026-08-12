# IdeaDump - Personal PRD Management Hub

A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.

## Overview

**Problem**: PRDs are scattered across different locations, making it hard to track progress and pick up where you left off.

**Solution**: IdeaDump - a clean, personal hub where you can:
- Import and store all PRDs (markdown format)
- Track project status through defined stages
- Add notes/journal entries per project
- Link to GitHub repos
- Access from any device
- Send PRDs directly from tools like Antigravity

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | shadcn/ui + Tailwind CSS (customizable components) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Magic Link |
| Hosting | Vercel |
| Markdown | react-markdown + remark-gfm |

---

## User Review Required

> [!IMPORTANT]
> **Single-user vs Multi-user**: This plan assumes a **single-user** setup (just you). Magic link auth will restrict access to your email only. Let me know if you'd want to expand this later.

> [!NOTE]
> **Antigravity Integration**: I'll create a simple API endpoint with an API key. When you create a PRD in Antigravity, you could use a workflow to POST it to IdeaDump automatically.

---

## Database Schema

```sql
-- Projects table (main entity)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  prd_content TEXT,                    -- Markdown content
  github_url TEXT,
  priority TEXT DEFAULT 'medium',      -- low, medium, high
  tags TEXT[],                         -- Array of tags
  completed BOOLEAN DEFAULT FALSE,     -- Manual toggle
  archived BOOLEAN DEFAULT FALSE,      -- Manual toggle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Status is INFERRED, not stored:
-- idea: no prd_content or short content
-- prd: has substantial prd_content (>500 chars)
-- in_development: has github_url
-- completed: completed = true
-- archived: archived = true

-- Notes table (journal entries per project)
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table (for external integrations)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

---

## Proposed Changes

### Core Structure

#### [NEW] Project Scaffold
```
ideadump/
├── app/
│   ├── layout.tsx              # Root layout with auth provider
│   ├── page.tsx                # Landing/login page
│   ├── globals.css             # Global styles + design tokens
│   ├── dashboard/
│   │   ├── page.tsx            # Main dashboard (project list)
│   │   └── layout.tsx          # Dashboard layout with sidebar
│   ├── project/
│   │   └── [id]/
│   │       └── page.tsx        # Individual project view
│   ├── settings/
│   │   └── page.tsx            # API keys, preferences
│   └── api/
│       ├── projects/
│       │   └── route.ts        # CRUD for projects
│       ├── notes/
│       │   └── route.ts        # CRUD for notes
│       └── ingest/
│           └── route.ts        # External API endpoint
├── components/
│   ├── ui/                     # Base UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   └── Card.tsx
│   ├── ProjectCard.tsx         # Project card in list view
│   ├── ProjectView.tsx         # Full project detail view
│   ├── MarkdownRenderer.tsx    # PRD display
│   ├── StatusBadge.tsx         # Status indicator
│   ├── NotesPanel.tsx          # Notes/journal section
│   ├── FileUpload.tsx          # Markdown file upload
│   ├── Sidebar.tsx             # Navigation sidebar
│   └── SearchBar.tsx           # Search + filter
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client
│   │   ├── server.ts           # Server client
│   │   └── middleware.ts       # Auth middleware
│   ├── types.ts                # TypeScript types
│   └── utils.ts                # Helper functions
├── middleware.ts               # Next.js middleware for auth
└── public/
    └── ...                     # Static assets
```

---

### UI Design (Wispr-Inspired)

#### Design Philosophy
- **Modern & Minimal**: Clean, tech-forward aesthetic
- **Dark-Mode First**: Deep blacks with vibrant accent pops
- **Generous Whitespace**: Let content breathe
- **Subtle Motion**: Purposeful micro-interactions

---

#### Color System

**Theme Support**: Both light and dark mode with consistent pastel accents

```css
:root {
  /* ===== DARK MODE (Default) ===== */
  --bg-base: #0F172A;           /* Deep Slate */
  --bg-elevated: #1E293B;       /* Elevated cards */
  --bg-hover: #334155;          /* Hover state */
  
  --text-primary: #FFFFFF;      /* Headers */
  --text-secondary: #94A3B8;    /* Body text */
  --text-muted: #64748B;        /* Timestamps, meta */
  
  /* ===== LIGHT MODE ===== */
  /* (toggled via class or media query) */
  --bg-base-light: #F8FAFC;     /* Crisp Off-White */
  --bg-elevated-light: #FFFFFF;
  --text-primary-light: #0F172A;
  --text-secondary-light: #475569;
  
  /* ===== ACCENT COLORS (Pastel Palette) ===== */
  --accent-rose: #E37083;       /* Rose Pink - Primary interactive */
  --accent-coral: #F49AA2;      /* Soft Coral - Gradients */
  --accent-sage: #A8BF8A;       /* Sage Green - Secondary accents */
  --accent-blue: #89B7C2;       /* Muted Blue - Primary interactive alt */
  --accent-apricot: #FCCD86;    /* Warm Apricot - Secondary accents */
  
  /* Borders */
  --border-subtle: #334155;     /* Card borders (dark) */
  --border-hover: #475569;
  --border-subtle-light: #E2E8F0;  /* Card borders (light) */
  
  /* ===== GRADIENTS ===== */
  --gradient-glow: linear-gradient(135deg, #F49AA2 0%, #89B7C2 100%);
  --gradient-accent: linear-gradient(135deg, #E37083 0%, #89B7C2 100%);
  
  /* ===== STATUS COLORS ===== */
  --status-idea: #89B7C2;        /* Muted Blue */
  --status-prd: #E37083;         /* Rose Pink */
  --status-dev: #FCCD86;         /* Warm Apricot */
  --status-complete: #A8BF8A;    /* Sage Green */
  --status-archived: #64748B;    /* Slate Gray */
}

/* Dark mode (default) */
[data-theme="dark"] {
  --bg: var(--bg-base);
  --bg-card: var(--bg-elevated);
  --text: var(--text-primary);
  --text-body: var(--text-secondary);
  --border: var(--border-subtle);
}

/* Light mode */
[data-theme="light"] {
  --bg: var(--bg-base-light);
  --bg-card: var(--bg-elevated-light);
  --text: var(--text-primary-light);
  --text-body: var(--text-secondary-light);
  --border: var(--border-subtle-light);
}
```

**Color Application Guide**:

| UI Element | Color |
|------------|-------|
| Primary buttons, active tabs | Rose Pink `#E37083` or Muted Blue `#89B7C2` |
| Badges, tags, hover effects | Sage Green `#A8BF8A`, Warm Apricot `#FCCD86` |
| Glowing backgrounds, blurs | Gradient: Soft Coral → Muted Blue |
| Links, interactive text | Rose Pink `#E37083` |
| Success states | Sage Green `#A8BF8A` |
| Warning/in-progress | Warm Apricot `#FCCD86` |

---

#### Typography

| Element | Font | Weight | Size | Letter Spacing |
|---------|------|--------|------|----------------|
| **Headings** | Inter / Plus Jakarta Sans | Bold (700) | 32-48px | -0.02em |
| **Subheadings** | Inter | Semibold (600) | 20-24px | -0.01em |
| **Body** | Inter | Regular (400) | 14-16px | normal |
| **Captions** | Inter | Medium (500) | 12-13px | 0.02em |

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

---

#### Layout & Spacing

| Property | Value |
|----------|-------|
| Section margin | 80px - 120px |
| Card padding | 24px - 40px |
| Border radius (cards) | 16px - 24px |
| Border radius (buttons) | 8px - 12px |
| Card border | 1px solid var(--border-subtle) |
| Grid gap | 16px - 24px |

**Bento Grid Layout** (Dashboard):
```
┌────────────────┬─────────┬─────────┐
│                │         │         │
│   Featured     │  Card   │  Card   │
│   Project      │         │         │
│                ├─────────┴─────────┤
├────────┬───────┤                   │
│  Card  │ Card  │   Large Card      │
│        │       │                   │
└────────┴───────┴───────────────────┘
```

---

#### Interactions & Animations

**Hover Effects**:
```css
.card {
  transition: all 0.2s ease;
  border: 1px solid var(--border-subtle);
}

.card:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(139, 92, 246, 0.1);
}

.button-primary {
  background: var(--accent-gradient);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
}

.button-primary:hover {
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
  transform: scale(1.02);
}
```

**Scroll Animations** (fade in + slide up):
```typescript
// Using Framer Motion or CSS
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: 'easeOut' }
};
```

**Status Badge Glow**:
```css
.status-badge {
  box-shadow: 0 0 12px currentColor;
  opacity: 0.9;
}
```

---

#### Visual Elements

- **Cards**: Bento-style with subtle borders, soft inner glow on hover
- **Backgrounds**: Subtle gradient meshes or noise textures for depth
- **Icons**: Lucide icons (comes with shadcn/ui)
- **Empty States**: Friendly illustrations with accent gradient

#### Dashboard Layout
```
┌─────────────────────────────────────────────────────────────┐
│  🗂️ IdeaDump                              [Search...]  [+]  │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ FILTERS  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│          │  │ Project1 │ │ Project2 │ │ Project3 │         │
│ □ Ideas  │  │ ●──────  │ │ ●──────  │ │ ●──────  │         │
│ □ PRD    │  │ Tags     │ │ Tags     │ │ Tags     │         │
│ □ In Dev │  └──────────┘ └──────────┘ └──────────┘         │
│ □ Done   │                                                  │
│ □ Archive│  ┌──────────┐ ┌──────────┐                      │
│          │  │ Project4 │ │ Project5 │                      │
│ ───────  │  │ ●──────  │ │ ●──────  │                      │
│ TAGS     │  │ Tags     │ │ Tags     │                      │
│          │  └──────────┘ └──────────┘                      │
│ #ai      │                                                  │
│ #mobile  │                                                  │
│ #chrome  │                                                  │
│          │                                                  │
├──────────┴──────────────────────────────────────────────────┤
│  Settings                                                   │
└─────────────────────────────────────────────────────────────┘
```

#### Project View Layout
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    SimplifyIt                    [Edit] [Archive]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: [In Development ▼]     Priority: [High ▼]         │
│  GitHub: github.com/user/simplifyit                        │
│  Tags: #chrome-extension  #ai  #productivity               │
│                                                             │
│  Created: Jan 21, 2026    Updated: Jan 25, 2026            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📄 PRD                                              [View] │
│  ─────────────────────────────────────────────────────────  │
│  # SimplifyIt                                               │
│  A browser extension that simplifies complex content...     │
│  ## Features                                                │
│  - Auto-detect content type                                 │
│  - Summarize with AI                                        │
│  ...                                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📝 Notes                                        [+ Add]    │
│  ─────────────────────────────────────────────────────────  │
│  Jan 25: Finished planning phase, moving to execution       │
│  Jan 23: Need to research Chrome extension manifest v3      │
│  Jan 21: Initial idea - started PRD                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Key Features

#### 1. PRD Import
- Drag & drop `.md` files
- Paste markdown directly
- API endpoint for automated uploads

#### 2. Status Workflow (Passive/Automatic)

Status is **automatically inferred** from the content - no manual updates needed!

| Condition | Inferred Status |
|-----------|----------------|
| Just a title + brief description | 💡 **Idea** |
| Has substantial PRD content (markdown document) | 📄 **PRD** |
| Has a GitHub URL linked | 🚧 **In Development** |
| Marked complete by user (only manual action) | ✅ **Completed** |
| Archived by user | 🗄️ **Archived** |

```typescript
// Status inference logic
function inferStatus(project: Project): Status {
  if (project.archived) return 'archived';
  if (project.completed) return 'completed';
  if (project.github_url) return 'in_development';
  if (project.prd_content && project.prd_content.length > 500) return 'prd';
  return 'idea';
}
```

- Status badge updates automatically as you add content
- Only "Completed" and "Archived" are manual toggles
- Visual color coding for each status

#### 3. Notes System
- Chronological journal entries
- Timestamps auto-added
- Markdown support in notes

#### 4. External API
```typescript
// POST /api/ingest
// Headers: { "x-api-key": "your-api-key" }
// Body:
{
  "title": "New Project",
  "prd_content": "# PRD Content\n...",
  "status": "prd",
  "tags": ["ai", "web"]
}
```

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify no build errors
- Test API endpoints with sample requests
- Verify Supabase RLS policies work correctly

### Manual Verification
1. **Auth Flow**: Test magic link login/logout
2. **PRD Upload**: Upload a sample markdown file
3. **Status Changes**: Cycle through all status states
4. **Notes**: Add/view notes on a project
5. **API**: Use curl/Postman to hit the ingest endpoint
6. **Responsive**: Verify layout on mobile viewport

### Browser Test
- Navigate through full user flow in browser
- Verify dark theme renders correctly
- Test search and filtering

---

## Deployment Guide

### Supabase Setup
1. Create new Supabase project
2. Run the SQL schema in SQL Editor
3. Enable Email auth with magic link
4. Set up RLS policies
5. Copy project URL and anon key

### Vercel Deployment
1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy

---

## Future Enhancements (Out of Scope)
- [ ] AI-powered PRD suggestions
- [ ] Export to PDF
- [ ] Collaborative editing
- [ ] Kanban board view
- [ ] Mobile app
