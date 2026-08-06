# Repository Agent Guide

## Scope

- Apply this file to the entire repository.
- Read the nearest nested `AGENTS.md` before editing under `components/`, `app/api/`, `lib/`, or `lib/rbac/`; the more specific file supplements or overrides this guide.
- Keep instructions aligned with the repository as it exists. Update the relevant `AGENTS.md` when setup, validation, architecture, or contribution workflows change.

## Repository

- The main application is a strict TypeScript, React 18, Next.js 14 App Router project backed by Supabase Auth and Postgres.
- `services/finance-ocr/` is a separate Node 22.22.x TypeScript service deployed through `render.yaml`.
- Canonical forward database migrations live in `supabase/migrations/`. The adopted schema baseline and supporting snapshot live directly under `supabase/`.

## Setup and Environment

- Install application dependencies with `npm install`.
- Copy `.env.example` to `.env.local` and provide the required local values.
- Never commit `.env.local`, access tokens, service-role keys, OCR secret keys, or other credentials.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` in trusted server environments only. Never expose them through `NEXT_PUBLIC_*` variables or browser code.
- For the OCR service, work from `services/finance-ocr/` and install its pinned dependencies with `npm ci`.

## Validation

- Validate application changes with:

  ```powershell
  npm run lint
  npx tsc --noEmit
  npm run build
  ```

- Run `npm run test:log-viewer` when changing the log-viewer parser or fixtures.
- Validate Finance OCR changes from `services/finance-ocr/` with:

  ```powershell
  npm run typecheck
  npm test
  npm run build
  ```

- Run the smallest relevant checks while iterating, then complete every applicable check before handing off finished work.

## Editing Rules

- Do not use em dashes in user-facing copy, code comments, documentation, or agent responses. Use a comma, colon, semicolon, parentheses, or a short hyphen instead.
- Do not add generic `Description` labels or decorative, repetitive, or self-evident description text to any component. Keep explanatory copy only when it is required to complete an action, communicate validation, error, progress, status, or safety information, or meet accessibility requirements.
- Do not expose raw/default browser UI for user-facing form controls. Reuse shared app components, or create a reusable styled component that follows the app design system before using native inputs directly.
- Follow `document/DESIGN_SYSTEM.md` and `components/AGENTS.md` for UI work.
- Keep domain types in `lib/types.ts` unless a nearer scoped guide documents an exception.
- Reuse the repository Supabase clients and RBAC guards; do not create inline clients or bypass authorization helpers.
- Add database changes as new forward migrations. Do not rewrite applied migrations or replay the reviewed production baseline over an existing project.
- Do not edit generated output such as `.next/`, OCR `dist/`, or dependency directories.

## Contribution Rules

- Keep changes focused and preserve unrelated working-tree edits.
- Update a lockfile only when its corresponding dependencies change.
- Use short, atomic commits that describe one coherent result.
- Document required environment or deployment changes without committing secrets.
