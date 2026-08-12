# Library Code Guide

## Scope

- Apply this guide to everything under `lib/`.
- The more specific `lib/rbac/AGENTS.md` supplements this guide for RBAC code.

## Ownership

- Keep domain behavior in its owning directory, such as `film/`, `finance/`, `logs/`, or `projects/`.
- Group a domain's common client, validation, persistence, service, and shared-value layers in its `core/` directory. Reserve the domain root for named capabilities and subfeatures.
- Keep domain types in `lib/types.ts` until the reviewed domain-type migration is implemented as a focused change.
- Keep genuinely shared infrastructure in `auth/`, `rbac/`, `supabase/`, `contexts/`, or another clearly named cross-domain directory.
- Avoid adding new domain-owned helpers at the top level of `lib/`.

## Runtime Boundaries

- Mark browser-only modules with `'use client'` and do not import server credentials or server-only clients into them.
- Keep `lib/supabase/admin.ts` and `lib/supabase/server.ts` server-only in practice. Never import them into a client component.
- Use `lib/supabase/client.ts` only for browser Auth or an explicitly reviewed browser Storage operation.
- Keep modules imported by `services/finance-ocr/` independent of React, browser APIs, Next.js runtime APIs, and application credentials.
- Prefer pure functions for parsing, normalization, ordering, validation, and formatting.

## Data Access and Domain Logic

- Reuse existing repositories and access modules instead of duplicating queries.
- Keep ownership filters explicit whenever a service-role client accesses user data.
- Separate persistence from transport responses so domain code does not depend on `NextResponse` unless it is intentionally an API helper.
- Keep runtime configuration and mutable state out of type declarations when a domain-owned configuration module is available.

## Validation

- Run feature-specific scripts when changing Finance or Log Viewer logic.
- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before handoff.
- For shared Finance code imported by OCR, also validate `services/finance-ocr/` with `npm run typecheck`, `npm test`, and `npm run build`.
