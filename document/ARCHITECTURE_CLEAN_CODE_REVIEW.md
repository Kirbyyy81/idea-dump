# Architecture and Clean Code Review

Original review date: 2026-07-31

Progress tracker last verified: 2026-08-02

## Purpose

This document reviews the current IdeaDump repository structure from a clean code, maintainability, and organization perspective. It identifies the strongest parts of the current architecture, the primary sources of complexity, and an incremental path toward clearer feature boundaries.

No product behavior changes are proposed as part of this review.

## Living Document and Status Rules

This review is also the source of truth for architecture and clean-code cleanup progress. Any change that advances or completes an issue in this document must update the progress tracker in the same pull request or commit.

Use these statuses consistently:

- **Not started**: The issue is present and no focused remediation has landed.
- **In progress**: A focused remediation is actively underway, but its completion gate has not been met.
- **Partial**: A recommended pattern exists in part of the repository, but material scope remains.
- **Blocked**: Progress requires a documented product, infrastructure, or ownership decision.
- **Done**: The completion gate in the tracker has been met and all applicable validation has passed.

When updating progress:

1. Update `Progress tracker last verified` at the top of this document.
2. Update the issue status, current evidence, and last-updated date.
3. Add newly discovered structural issues instead of leaving them only in pull request discussion.
4. Do not mark an issue as done based only on moved files or a lower line count. Confirm the intended boundary, tests, documentation, and applicable validation.
5. If a completed pattern later regresses, reopen the issue by changing its status and recording the new evidence.

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
- Canonical forward migrations and adopted baseline artifacts are grouped under `supabase/`.
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

- [`app/settings/access/AccessControlClient.tsx`](../app/settings/access/AccessControlClient.tsx), 738 lines
- [`app/film/rolls/[id]/page.tsx`](../app/film/rolls/%5Bid%5D/page.tsx), 724 lines
- [`services/finance-ocr/src/repository.ts`](../services/finance-ocr/src/repository.ts), 658 lines
- [`lib/openapi.ts`](../lib/openapi.ts), 637 lines
- [`lib/types.ts`](../lib/types.ts), 630 lines
- [`components/organisms/Sidebar.tsx`](../components/organisms/Sidebar.tsx), 439 lines
- [`app/finance/review/page.tsx`](../app/finance/review/page.tsx), 431 lines

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

The root [`AGENTS.md`](../AGENTS.md) and scoped [`lib/AGENTS.md`](../lib/AGENTS.md) currently require domain types to remain in `lib/types.ts`. Those instructions should be updated when the domain-type migration is implemented so future work follows the new structure.

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

### 6. No-op layouts and legacy routes added structural noise

The original review found eleven nested `layout.tsx` files that only returned `children` and six route folders that existed only to redirect legacy paths.

#### Phase 1 resolution

Completed on 2026-08-02:

- Removed all eleven no-op layouts while preserving the root layout and the Finance authorization layout.
- Removed `/docs`, `/signup`, `/reset-password`, `/finance/upload`, and `/film/rolls/[id]/photobook` without replacement redirects because backward compatibility is not required for this personal system.
- Retained `/api-tools` as a compatibility adapter because canonical Supabase module metadata still supplies that path to database-driven dashboard and sidebar navigation. It redirects to `/logs/api-tools`.
- Confirmed the PWA uses `/share-target/finance` and hands off to `/finance/add`.
- Confirmed password recovery targets `/login/reset-password` through `/auth/callback`.
- Confirmed Film navigation uses `/film/rolls/[id]?step=photobook` directly.
- Removed obsolete public-auth and shell-access entries for deleted routes while retaining the required `/api-tools` Logs access rule.

Future compatibility routes should be added only when a current external consumer requires them. Canonical routes should remain documented in one place.

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

For example, `Sidebar` and ticket workflows live under shared organisms because they are reused across feature routes, while the Log Viewer now lives in `app/log-viewer/_components/` because it is route-owned.

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

### 11. A feature-specific provider is installed globally

[`AuthenticatedAppShell`](../components/organisms/AuthenticatedAppShell.tsx) installs `FinanceShareTargetProvider` around every route, including public authentication routes that the persistent shell later bypasses. This makes a Finance-only browser workflow part of the global application composition and increases the responsibility of the root shell.

The provider also owns navigation, access checks, service-worker messaging, alerts, and temporary shared files. Its placement makes the Finance share-target protocol harder to reason about independently from authentication and navigation.

#### Recommendation

- Install the Finance share-target provider only within the protected Finance boundary, or introduce a narrowly scoped global share-target adapter that hands validated events to Finance.
- Keep service-worker transport separate from Finance page state and presentation.
- Add end-to-end coverage for authenticated, unauthenticated, unauthorized, expired, and successfully claimed share payloads before relocating the provider.

### 12. Database type safety stops at the Supabase client boundary

The Supabase clients are created without a generated `Database` type. Repositories and route handlers compensate with handwritten row interfaces and casts such as `as unknown as Project`. This weakens compile-time checks for table names, selected columns, RPC parameters, nullability, and migration-driven schema changes.

This concern is separate from moving queries into repositories. A repository boundary improves ownership, while generated database types improve correctness inside that boundary.

#### Recommendation

- Generate a checked-in Supabase database type from the reviewed schema.
- Parameterize browser, server, and admin Supabase clients with the same `Database` type.
- Keep domain models distinct when they intentionally normalize or hide database fields.
- Regenerate and review the database type whenever a canonical migration changes the exposed contract.

### 13. The PWA service worker is a separate untyped application boundary

[`public/sw.js`](../public/sw.js) is approximately 194 lines and implements caching, lifecycle handling, a Finance share-target protocol, temporary file ownership, message delivery, acknowledgements, and expiry behavior. Because it lives under `public/`, it is copied as-is rather than passing through the main TypeScript build.

The Finance share-target flow depends on a message contract shared informally between this service worker and `FinanceShareTargetProvider`, but that contract has no shared type or focused automated test.

#### Recommendation

- Move service-worker source into a typed build input and emit the deployable `public/sw.js` artifact through a documented build step.
- Define the share-target message protocol in one environment-independent module.
- Add focused tests for claim, acknowledge, expiry, duplicate delivery, invalid payload, and client-navigation behavior.
- Keep generated service-worker output out of manual edits and document how it is validated.

## Testing and Tooling

### Current observations

- The OCR service has a normal Vitest suite.
- The main application uses several custom Node.js test scripts.
- All Finance source modules are strict TypeScript, while `allowJs` remains enabled in the main TypeScript configuration.
- The GitHub workflows create pull requests and releases, but do not run application validation.
- Phase 1 removed the automatic `predev: npm install`; dependency installation remains an explicit setup step.

### Recommendations

1. Add a root application test runner, preferably Vitest.
2. Convert custom script tests into normal test files.
3. Co-locate tests with features or use a consistent top-level test directory.
4. Add route authorization and validation tests.
5. Add repository tests around ownership filtering.
6. Add focused UI tests for critical forms and state transitions.
7. Disable `allowJs` after reviewing the remaining JavaScript configuration and test files.
8. Add a CI validation workflow.

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

## Documentation Alignment

The original review found stale route documentation and references to scoped guides that did not exist. Phase 1 aligned the documentation with the implementation:

- Added scoped guides for `components/`, `app/api/`, `lib/`, and `lib/rbac/`.
- Updated [`README.md`](../README.md) to list canonical project, API tools, API docs, authentication, Finance, and Film routes, plus the required database-backed `/api-tools` compatibility path.
- Documented browser, server, service-role, shared OCR, API authorization, component ownership, and RBAC boundaries in the nearest applicable guide.
- Kept centralized domain types as the current rule until the Phase 2 type migration changes the implementation.

Inaccurate guidance causes future changes to reinforce outdated assumptions, so documentation alignment remains an ongoing contribution requirement.

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

1. [x] Correct README and AGENTS documentation drift, including the missing scoped-guide references.
2. [ ] Add continuous integration validation. Deferred from the current Phase 1 implementation scope.
3. [x] Remove `predev: npm install`.
4. [x] Remove unnecessary no-op layouts.
5. [x] Remove unused legacy routes after checking PWA, Auth, database metadata, and internal navigation consumers. Retain only the database-backed `/api-tools` adapter.

### Phase 2: Type and API consistency

1. Convert the remaining JavaScript Finance modules to TypeScript.
2. Introduce domain-owned type files.
3. Move runtime configuration out of type files.
4. Generate and adopt typed Supabase database clients.
5. Standardize API errors and request validation.
6. Add typed clients for Film, Projects, Tickets, and Logs.

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
5. Move the Finance share-target provider out of the global application shell.
6. Move initial data loading to server components where practical.

### Phase 5: OCR service boundary

1. Create the shared Finance core package.
2. Move pure shared types and functions into the package.
3. Update the application and OCR service to depend on it.
4. Remove the OCR alias that points to the application root.
5. Validate that the OCR service can build independently.

### Phase 6: PWA boundary

1. Define the service-worker message protocol in a shared typed module.
2. Move service-worker source into the TypeScript build workflow.
3. Add focused protocol and lifecycle tests.
4. Generate and verify the deployable `public/sw.js` artifact.

## Architecture Issue Progress Tracker

Summary as of 2026-08-05:

- Done: 4
- In progress: 0
- Partial: 9
- Not started: 9
- Blocked: 0

| ID | Issue | Status | Current evidence and completion gate | Last updated |
| --- | --- | --- | --- | --- |
| AC-001 | Documentation and scoped guidance drift | **Done** | Added the four referenced scoped guides, aligned README routes and module ownership, documented current boundaries, and verified local document links. | 2026-08-02 |
| AC-002 | Missing CI validation workflow | **Not started** | Existing workflows only create pull requests and releases. CI was explicitly deferred from this Phase 1 pass. Done when main-app and OCR lint, typecheck, tests, and builds run on pull requests. | 2026-08-02 |
| AC-003 | `predev` installs dependencies | **Done** | Removed the `predev` script. Setup continues to require an explicit `npm install`, and no dependency or lockfile change was needed. | 2026-08-02 |
| AC-004 | No-op route layouts | **Done** | Removed all eleven layouts that only returned `children`. The root layout and Finance authorization layout remain. | 2026-08-02 |
| AC-005 | Legacy redirect route noise | **Done** | Removed five unused legacy routes after verifying PWA, Auth, and Film navigation use canonical paths. Retained and documented `/api-tools` because Supabase module metadata actively supplies it to runtime navigation. | 2026-08-02 |
| AC-006 | Main-app test organization | **Partial** | OCR has Vitest, while the main app uses custom Node.js scripts. Done when the main app has a standard test runner, consistent test placement, and CI execution. | 2026-08-02 |
| AC-007 | Remaining Finance JavaScript and `allowJs` | **Partial** | Converted all four Finance source modules to strict TypeScript and updated their focused test runners. Root TypeScript still enables `allowJs`. Done when `allowJs` is disabled without breaking the build or tests. | 2026-08-05 |
| AC-008 | Domain type monolith | **Not started** | `lib/types.ts` is about 630 lines and has 71 importers. Done when domain types and runtime configuration have clear owners and cross-domain imports no longer depend on a monolith. | 2026-08-02 |
| AC-009 | Untyped Supabase schema boundary | **Not started** | Supabase clients have no generated `Database` generic. Done when one reviewed generated type parameterizes browser, server, and admin clients and is refreshed with schema changes. | 2026-08-02 |
| AC-010 | Inconsistent API errors and validation | **Partial** | Finance and Film have helpers, while other routes define local parsing and response shapes. Done when transport errors, validation failures, and query parsing follow one documented contract with tests. | 2026-08-02 |
| AC-011 | Missing typed feature clients | **Partial** | Finance has reusable client APIs, while Film, Projects, Tickets, and Logs still use widespread raw `fetch()`. Done when browser requests use domain-owned typed clients or direct server services. | 2026-08-02 |
| AC-012 | Direct data access in route handlers | **Partial** | Projects and Logs have data-access modules, but 24 of 32 API route files directly create the admin client. Done when service-role queries are concentrated in owned repositories and routes remain HTTP adapters. | 2026-08-02 |
| AC-013 | Inconsistent business-service layer | **Partial** | Some helpers and OCR services exist, but multi-step Film, Finance, and Ticket orchestration remains in routes. Done when business operations have explicit services with focused tests. | 2026-08-02 |
| AC-014 | Monolithic OpenAPI definition | **Not started** | `lib/openapi.ts` is about 637 lines. Done when domain definitions are independently owned, composed into one specification, and contract checks pass. | 2026-08-02 |
| AC-015 | Large page and client-component responsibilities | **Partial** | Some Film sections are extracted, but Film roll detail, Access Control, and Finance review remain large stateful files. Done when state, mutations, dialogs, and sections have focused ownership and regression coverage. | 2026-08-02 |
| AC-016 | Overloaded application shell | **Partial** | Extracted canonical module route mapping and matching into client-safe `lib/rbac/routes.ts`, used by `AppShell` authorization and Sidebar navigation activity. `AppShell` still owns project loading, navigation, responsive behavior, spacing, and loading UI. Done when protected layout, page container, loading state, and mobile navigation responsibilities are explicit. | 2026-08-02 |
| AC-017 | Client-heavy initial data loading | **Not started** | 26 of 33 remaining pages are client components and 24 pages use `useEffect()`. Done when practical initial reads move to server components and interactive client islands retain only browser state. | 2026-08-02 |
| AC-018 | Component ownership ambiguity | **Partial** | The Log Viewer was moved into `app/log-viewer/_components/`, and route-private feature sections already exist. `AppShell` now owns rendering `components/molecules/PageHeader.tsx` for shared authenticated-page titles and optional actions. Shared Sidebar and Ticket workflows remain under `components/` because they are reused across feature routes, but ownership rules are not yet applied consistently everywhere. Done when shared UI, layout, cross-feature, and feature-private ownership rules are consistently applied. | 2026-08-04 |
| AC-019 | Inconsistent non-route naming | **Not started** | `articleCreation`, `logViewer`, and top-level `dailyLogs.ts` remain naming and ownership outliers. Done when one convention is documented and applied without compatibility regressions. | 2026-08-02 |
| AC-020 | Global Finance share-target provider | **Not started** | `FinanceShareTargetProvider` wraps every route through `AuthenticatedAppShell`. Done when the Finance workflow is scoped appropriately and authenticated, unauthorized, expired, and successful share flows are verified. | 2026-08-02 |
| AC-021 | OCR service source coupling | **Not started** | The OCR TypeScript and bundler aliases point to the application root. Done when both runtimes depend on an explicit shared package and OCR builds without application-source aliases. | 2026-08-02 |
| AC-022 | Untyped and untested service-worker workflow | **Not started** | `public/sw.js` is about 194 lines and shares an informal protocol with React code. Done when source and protocol are typed, lifecycle behavior is tested, and generated output is verified. | 2026-08-02 |

## Final Assessment

The repository does not need a complete rewrite or a single large restructuring effort. Its strongest path forward is incremental standardization:

- Give every feature the same internal layers.
- Keep framework route files thin.
- Place types and runtime configuration with their owning domains.
- Separate browser, server, persistence, and presentation responsibilities.
- Make the OCR service dependency boundary explicit.
- Use automated tests and CI to protect each refactoring step.

Phase 1 documentation and low-risk structure cleanup is complete except for the explicitly deferred CI workflow. The next work should be CI, followed by type ownership and data-access boundaries. Large UI decomposition and OCR package extraction should come afterward because they carry more integration risk.
