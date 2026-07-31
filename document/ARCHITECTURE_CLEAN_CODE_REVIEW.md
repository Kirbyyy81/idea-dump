# Architecture and Clean Code Review

Date: 2026-07-31

## Purpose

This document reviews the current IdeaDump repository structure from a clean code, maintainability, and organization perspective. It identifies the strongest parts of the current architecture, the primary sources of complexity, and an incremental path toward clearer feature boundaries.

No product behavior changes are proposed as part of this review.

## Current System Overview

IdeaDump is primarily a strict TypeScript, React 18, and Next.js 14 App Router application backed by Supabase Auth and Postgres. It also contains a separately deployed Node.js Finance OCR service.

```text
idea-dump/
├── app/                         # Next.js pages, layouts, and API routes
│   ├── api/
│   │   ├── film/
│   │   ├── finance/
│   │   ├── logs/
│   │   ├── projects/
│   │   ├── tickets/
│   │   └── ...
│   ├── article-creation/
│   ├── dashboard/
│   ├── film/
│   ├── finance/
│   ├── logs/
│   ├── log-viewer/
│   ├── projects/
│   ├── settings/
│   └── tickets/
├── components/
│   ├── atoms/
│   ├── molecules/
│   └── organisms/
├── lib/
│   ├── articleCreation/
│   ├── auth/
│   ├── film/
│   ├── finance/
│   ├── logs/
│   ├── logViewer/
│   ├── projects/
│   ├── rbac/
│   └── supabase/
├── services/
│   └── finance-ocr/
├── supabase/
│   └── migrations/
├── document/
├── public/
└── scripts/
```

The main architectural flow is:

```text
Pages and components
        ↓
Domain logic in lib/
        ↓
Next.js API route handlers
        ↓
Supabase Auth and Postgres

Finance upload and queue routes
        ↓
Finance OCR service
        ↓
OCR processing and queue workers
```

## Existing Strengths

The repository already has several good foundations:

- Strict TypeScript is enabled for the main application.
- UI primitives and composite components have documented design rules.
- Page-private components use the `app/<route>/_components/` convention.
- Supabase client creation and RBAC enforcement have dedicated helpers.
- Canonical forward migrations are separated from historical migration records.
- Finance contains a reusable client API abstraction.
- Projects and logs demonstrate repository or data-access abstractions.
- The OCR service has a dedicated package, build process, and Vitest test suite.
- Repository-specific instructions document setup, validation, and security expectations.

The primary concern is not a lack of structure. It is that the structure has become inconsistent as more features have been added.

## Main Findings

### 1. Feature boundaries are distributed

A single feature can span many unrelated top-level locations. Finance currently appears in:

- `app/finance/`
- `app/api/finance/`
- `lib/finance/`
- `lib/types.ts`
- `scripts/`
- `supabase/migrations/`
- `services/finance-ocr/`

This is partly expected in a Next.js application, but domain responsibilities should be organized consistently within each location. At present, some features use repositories, some query Supabase directly in route handlers, some have typed API clients, and some use raw `fetch()` calls.

#### Recommendation

Keep framework entry points in `app/`, but establish the same internal layers for each domain:

```text
lib/<feature>/
├── types.ts
├── schemas.ts
├── repository.ts
├── service.ts
├── client.ts
└── constants.ts
```

The intended request flow should be:

```text
Route handler
    → authorization
    → request validation
    → feature service
    → repository
    → Supabase
```

Pages should communicate through a typed feature client or server-side service rather than embedding data access behavior.

### 2. Several files have too many responsibilities

The largest application files include:

- [`app/film/rolls/[id]/page.tsx`](../app/film/rolls/%5Bid%5D/page.tsx), approximately 670 lines
- [`app/settings/access/AccessControlClient.tsx`](../app/settings/access/AccessControlClient.tsx), approximately 660 lines
- [`lib/openapi.ts`](../lib/openapi.ts), approximately 620 lines
- [`services/finance-ocr/src/repository.ts`](../services/finance-ocr/src/repository.ts), approximately 620 lines
- [`lib/types.ts`](../lib/types.ts), over 600 physical lines
- [`components/organisms/Sidebar.tsx`](../components/organisms/Sidebar.tsx), approximately 410 lines
- [`app/finance/review/page.tsx`](../app/finance/review/page.tsx), approximately 410 lines

File length alone does not prove a design problem, but these files combine multiple state machines, API operations, formatting helpers, UI sections, or persistence responsibilities.

#### Recommendation

For large pages and client components, extract:

- Data-loading hooks
- Mutation hooks
- Forms
- Dialogs
- Page sections
- Mapping and formatting helpers
- Feature-specific API client functions

For the OCR repository, separate:

- Intake persistence
- Queue persistence
- Transaction persistence
- Duplicate detection queries
- Storage operations
- Cleanup operations

For the OpenAPI generator, split definitions by API domain and compose them into one final specification.

### 3. `lib/types.ts` is a domain type monolith

[`lib/types.ts`](../lib/types.ts) contains types and runtime configuration for projects, logs, tickets, film, and finance. This creates broad dependencies and makes unrelated features share a central change hotspot.

#### Recommendation

Move types to their owning domains:

```text
lib/projects/types.ts
lib/logs/types.ts
lib/tickets/types.ts
lib/film/types.ts
lib/finance/types.ts
```

Keep only genuinely cross-domain types in a shared type file.

Runtime values such as status configuration should live in domain configuration files rather than type files:

```text
lib/projects/status.ts
lib/tickets/status.ts
lib/film/status.ts
```

The current [`lib/AGENTS.md`](../lib/AGENTS.md) explicitly requires centralized domain types. That instruction should be updated in the same change so future work follows the new structure.

### 4. Server and client responsibilities are blurred

Most application pages are client components, and many load initial data with `useEffect()` and raw `fetch()` calls. This produces repeated loading, error, cancellation, and mutation code.

Highly interactive pages will still need client components, but the entire page does not always need to be client-rendered.

#### Recommendation

Prefer:

- Server components for initial data loading
- Small client islands for interactive forms and controls
- Feature hooks for client-side mutations
- Typed API clients for browser requests
- Server-side feature services when an API round trip is unnecessary

Finance already has [`lib/finance/clientApi.ts`](../lib/finance/clientApi.ts). Film, projects, tickets, and logs should follow a similar pattern rather than using raw `fetch()` calls throughout their pages.

### 5. The application shell has overlapping responsibilities

The root layout installs `AuthenticatedAppShell`, while many pages wrap their content in `AppShell` again. The nested-shell behavior is intentional, but `AppShell` currently represents several different concepts:

- Persistent navigation
- Route access handling
- Project navigation data
- Page spacing
- Page loading state
- Mobile navigation behavior

This makes page composition harder to understand.

#### Recommendation

Separate these responsibilities:

```text
ProtectedAppLayout   # session, access, navigation, global providers
PageContainer        # spacing and maximum width
PageLoadingState     # page-level loading presentation
MobileNavigation     # mobile drawer and focus management
```

Use App Router route groups to distinguish public and protected areas:

```text
app/
├── (public)/
│   └── login/
└── (protected)/
    ├── dashboard/
    ├── projects/
    ├── film/
    └── finance/
```

This would prevent public authentication routes from passing through the authenticated shell and make access boundaries visible from the directory structure.

### 6. Several layouts and routes add structural noise

Many nested `layout.tsx` files only return `children`. Several route folders exist only to redirect legacy paths:

- `/docs` redirects to `/settings/docs`
- `/api-tools` redirects to `/logs/api-tools`
- `/signup` redirects to `/login/signup`
- `/reset-password` redirects into the login flow
- `/finance/upload` redirects to `/finance/add`

Compatibility redirects can be valuable, but separate page and layout files make the application tree look more complex than the actual product.

#### Recommendation

- Remove no-op layouts that do not establish access, metadata, providers, or presentation.
- Keep canonical pages in one location.
- Move simple permanent legacy redirects into `next.config.mjs` when appropriate.
- Maintain one documented list of canonical and legacy routes.

### 7. The Finance OCR service is not fully independent

The OCR service is separately packaged and deployed, but it imports application source through a TypeScript alias that points to the repository root.

Examples include imports from:

- `lib/types.ts`
- `lib/finance/parser.ts`
- `lib/finance/normalizer.ts`
- `lib/finance/dashboard.ts`
- `lib/finance/values.ts`

This means the service is operationally separate but structurally coupled to the Next.js application.

#### Recommendation

Extract shared, environment-independent finance code into an explicit workspace package:

```text
packages/
└── finance-core/
    ├── package.json
    └── src/
        ├── types.ts
        ├── parser.ts
        ├── normalizer.ts
        ├── dashboard.ts
        └── values.ts
```

The Next.js application and OCR service should depend on this package explicitly. Browser-only, Next.js-only, Supabase client, and service runtime logic should remain outside it.

### 8. Route validation and data access patterns are inconsistent

The repository contains several patterns:

- Projects use a repository.
- Logs use an access layer.
- Finance and Film share authorization helpers but perform many Supabase queries in route handlers.
- Tickets contain substantial inline database behavior.
- Some request validation is centralized, while other validation is built directly inside route handlers.

This inconsistency increases the effort required to understand and audit a new endpoint.

#### Recommendation

Use a consistent structure for each feature:

```text
types.ts       # domain and transport types
schemas.ts     # request validation
repository.ts  # database access only
service.ts     # business rules and orchestration
client.ts      # browser API client
```

Route handlers should focus on:

1. Authorization
2. Input parsing
3. Calling a service
4. Mapping the result to an HTTP response

Also standardize:

- Error response shape
- Validation error format
- Ownership filtering
- Pagination conventions
- Query parameter parsing
- Logging behavior

Direct `createAdminClient()` calls should be concentrated in repositories. This would make service-role access easier to review.

### 9. Component organization will become harder to scale

The atomic design structure is documented clearly, but atoms, molecules, and organisms categorize components by abstraction level rather than feature ownership. Classification becomes subjective as the application grows.

For example, `Sidebar`, tickets, and the log viewer live together under shared organisms even though they have different ownership and reuse characteristics.

#### Recommendation

Retain shared design primitives, but make ownership clearer:

```text
components/
├── ui/              # Button, Input, Card, Select, Dialog
├── layout/          # AppShell, Sidebar, navigation
└── shared/          # Cross-feature composite components

app/<route>/_components/
└── ...              # Route-private feature components
```

Alternatively, keep the existing atomic directories but move feature-specific organisms into their owning route or feature module.

### 10. Naming conventions are not fully consistent

Examples include:

- `articleCreation/` and `logViewer/` use camelCase.
- Most route directories use kebab-case.
- Other domain directories use lowercase names.
- Some top-level helpers such as `dailyLogs.ts` sit outside the related `logs/` directory.

#### Recommendation

Choose one naming convention for non-route directories, preferably lowercase or kebab-case:

```text
article-creation/
log-viewer/
daily-logs/
```

Move domain-owned top-level helpers into their domain directories.

## Testing and Tooling

### Current observations

- The OCR service has a normal Vitest suite.
- The main application uses several custom Node.js test scripts.
- Four Finance source modules remain JavaScript files.
- `allowJs` is enabled in the main TypeScript configuration.
- The GitHub workflows create pull requests and releases, but do not run application validation.
- `predev` runs `npm install` every time development starts.

### Recommendations

1. Add a root application test runner, preferably Vitest.
2. Convert custom script tests into normal test files.
3. Co-locate tests with features or use a consistent top-level test directory.
4. Add route authorization and validation tests.
5. Add repository tests around ownership filtering.
6. Add focused UI tests for critical forms and state transitions.
7. Convert the remaining Finance JavaScript modules to TypeScript.
8. Disable `allowJs` after the conversion.
9. Remove `"predev": "npm install"` from `package.json`.
10. Add a CI validation workflow.

The CI workflow should run:

```text
Main application
├── npm run lint
├── npx tsc --noEmit
├── application tests
└── npm run build

Finance OCR service
├── npm run typecheck
├── npm test
└── npm run build
```

## Documentation Drift

Repository guidance currently differs from the implementation:

- [`app/api/AGENTS.md`](../app/api/AGENTS.md) says there are 16 API handlers, while the repository currently has 32 route files.
- [`README.md`](../README.md) documents `/project/...`, while the current route directory is `/projects/...`.
- The README says `/docs` redirects to `/api-tools`, while the implementation redirects it to `/settings/docs`.
- [`components/AGENTS.md`](../components/AGENTS.md) documents DM Serif Text and Inter, while [`app/layout.tsx`](../app/layout.tsx) uses Plus Jakarta Sans.
- [`lib/AGENTS.md`](../lib/AGENTS.md) says everything in `lib/` is server-safe except one React context, while `lib/` also contains browser-only profile cache and access context code.
- API guidance documents two authorization patterns but does not include the feature wrappers used by Finance and Film.

Inaccurate guidance causes future changes to reinforce outdated assumptions.

### Recommendation

- Update repository guidance whenever architecture changes.
- Keep route inventories short and generated where possible.
- Document patterns and boundaries instead of enumerating every file.
- Add documentation checks to architecture-related pull request reviews.

## Proposed Target Structure

The following structure can be reached incrementally without relocating the entire application:

```text
idea-dump/
├── app/
│   ├── (public)/
│   │   └── login/
│   ├── (protected)/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── logs/
│   │   ├── tickets/
│   │   ├── film/
│   │   ├── finance/
│   │   └── settings/
│   └── api/
│       └── ...thin route adapters...
├── components/
│   ├── ui/
│   ├── layout/
│   └── shared/
├── lib/
│   ├── auth/
│   ├── rbac/
│   ├── supabase/
│   ├── projects/
│   │   ├── types.ts
│   │   ├── schemas.ts
│   │   ├── repository.ts
│   │   ├── service.ts
│   │   └── client.ts
│   ├── logs/
│   ├── tickets/
│   ├── film/
│   └── finance/
├── packages/
│   └── finance-core/
├── services/
│   └── finance-ocr/
├── supabase/
│   └── migrations/
├── tests/
└── document/
```

## Recommended Implementation Order

### Phase 1: Low-risk consistency work

1. Correct README and AGENTS documentation drift.
2. Add continuous integration validation.
3. Remove `predev: npm install`.
4. Remove unnecessary no-op layouts.
5. Consolidate simple legacy redirects.

### Phase 2: Type and API consistency

1. Convert the remaining JavaScript Finance modules to TypeScript.
2. Introduce domain-owned type files.
3. Move runtime configuration out of type files.
4. Standardize API errors and request validation.
5. Add typed clients for Film, Projects, Tickets, and Logs.

### Phase 3: Data-access boundaries

1. Move direct Supabase queries from route handlers into repositories.
2. Add services for business rules and multi-step operations.
3. Keep route handlers as HTTP adapters.
4. Add repository and service tests.

### Phase 4: UI decomposition

1. Split the film roll detail page.
2. Split access control into focused panels and hooks.
3. Split the Finance review workflow.
4. Separate navigation shell behavior from page containers.
5. Move initial data loading to server components where practical.

### Phase 5: OCR service boundary

1. Create the shared Finance core package.
2. Move pure shared types and functions into the package.
3. Update the application and OCR service to depend on it.
4. Remove the OCR alias that points to the application root.
5. Validate that the OCR service can build independently.

## Final Assessment

The repository does not need a complete rewrite or a single large restructuring effort. Its strongest path forward is incremental standardization:

- Give every feature the same internal layers.
- Keep framework route files thin.
- Place types and runtime configuration with their owning domains.
- Separate browser, server, persistence, and presentation responsibilities.
- Make the OCR service dependency boundary explicit.
- Use automated tests and CI to protect each refactoring step.

The first work should be documentation and CI, followed by type ownership and data-access boundaries. Large UI decomposition and OCR package extraction should come afterward because they carry more integration risk.
