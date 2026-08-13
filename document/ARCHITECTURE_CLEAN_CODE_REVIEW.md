# Architecture and Clean Code Review

Original review date: 2026-07-31

Progress tracker last verified: 2026-08-12

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

IdeaDump is primarily a strict TypeScript, React 19, and Next.js 15 App Router application backed by Supabase Auth and Postgres. It also contains a separately deployed Node.js Finance OCR service.

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
│   ├── article-creation/
│   ├── auth/
│   ├── film/
│   ├── finance/
│   ├── logs/
│   ├── log-viewer/
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

- [`app/film/rolls/[id]/page.tsx`](../app/film/rolls/%5Bid%5D/page.tsx), about 657 lines
- [`app/settings/access/AccessControlClient.tsx`](../app/settings/access/AccessControlClient.tsx), about 656 lines
- [`services/finance-ocr/src/repository.ts`](../services/finance-ocr/src/repository.ts), about 636 lines
- [`lib/types.ts`](../lib/types.ts), about 602 lines
- [`app/finance/review/page.tsx`](../app/finance/review/page.tsx), about 477 lines
- [`components/organisms/Sidebar.tsx`](../components/organisms/Sidebar.tsx), about 407 lines

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
lib/film/rolls/status.ts
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

Finance already has [`lib/finance/core/client.ts`](../lib/finance/core/client.ts). Film, projects, tickets, and logs should follow a similar pattern rather than using raw `fetch()` calls throughout their pages.

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
- `lib/finance/ocr/parser.ts`
- `lib/finance/ocr/normalizer.ts`
- `lib/finance/dashboard.ts`
- `lib/finance/core/values.ts`

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

The initial route-boundary cleanup is complete. Finance, Film, Tickets, Projects, Logs, Notes, API keys, and Project ingestion now validate request data in domain helpers and keep service-role persistence out of route handlers. Routes are now responsible for authorization, transport parsing, calling domain logic, and mapping the result to HTTP responses.

Projects intentionally use a repository directly for simple ownership-scoped CRUD, while Logs retain their existing access layer because it contains their authorization-aware query policy. Finance, Film, Tickets, Notes, and API keys use explicit services where they own non-trivial behavior.

The remaining inconsistency is contractual rather than structural: error bodies, validation-error shapes, pagination conventions, and operational logging are not yet standardized across every feature.

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

Direct `createAdminClient()` calls are now concentrated in domain repositories, making service-role access easier to review.

### 9. Component organization will become harder to scale

The atomic design structure remains for genuinely shared primitives and layout components. Feature-owned UI now lives with its route: the Log Viewer is under `app/log-viewer/_components/`, and Ticket workflow components are under `app/tickets/_components/`. The Project detail route imports the Ticket-owned components where it embeds that workflow instead of treating them as generic shared organisms.

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

### 10. Naming conventions

The two camelCase domain outliers were renamed to `lib/article-creation/` and `lib/log-viewer/`. Non-route domain directories now consistently use lowercase or kebab-case names, while each domain can use its documented `core/` directory for common layers.

#### Recommendation

Choose one naming convention for non-route directories, preferably lowercase or kebab-case:

```text
article-creation/
log-viewer/
daily-logs/
```

Move domain-owned top-level helpers into their domain directories.

### 11. Finance share-target handling crosses application boundaries

Accepted Finance share files are now owned by `FinanceShareTargetProvider` inside the protected Finance layout. Leaving Finance unmounts that provider and discards files that were not submitted. Durable batches that were already committed continue processing independently.

`AuthenticatedAppShell` retains only a narrow `FinanceShareRejectionBridge` inside `AccessProvider`. It listens only when the user is signed out or lacks Finance access so pending service-worker files can be acknowledged, discarded, and explained instead of waiting for expiry. `AccessProvider` remains a generic RBAC context and does not own Finance or service-worker behavior.

#### Recommendation

- Keep accepted file state within the protected Finance boundary and keep the global rejection bridge free of Finance file state.
- Keep service-worker transport separate from Finance page state and presentation.
- Maintain the Finance share lifecycle suite covering authenticated success, signed-out and unauthorized rejection, expired payloads, navigation disposal, and multi-tab isolation.

### 12. Database type safety stops at the Supabase client boundary

The Supabase clients are created without a generated `Database` type. Repositories and route handlers compensate with handwritten row interfaces and casts such as `as unknown as Project`. This weakens compile-time checks for table names, selected columns, RPC parameters, nullability, and migration-driven schema changes.

This concern is separate from moving queries into repositories. A repository boundary improves ownership, while generated database types improve correctness inside that boundary.

#### Recommendation

- Generate a checked-in Supabase database type from the reviewed schema.
- Parameterize browser, server, and admin Supabase clients with the same `Database` type.
- Keep domain models distinct when they intentionally normalize or hide database fields.
- Regenerate and review the database type whenever a canonical migration changes the exposed contract.

### 13. The PWA service worker is a distinct build boundary

[`service-worker/sw.ts`](../service-worker/sw.ts) implements caching, lifecycle handling, temporary Finance file ownership, message delivery, acknowledgements, and expiry behavior. It imports the environment-independent protocol from [`lib/finance/share/protocol.ts`](../lib/finance/share/protocol.ts), is checked with a Web Worker-specific TypeScript configuration, and is bundled into [`public/sw.js`](../public/sw.js).

The React bridge, Finance provider, and service worker now consume the same typed message contract and runtime parsers. The application build regenerates the deployable worker, while root and Finance share tests reject generated-output drift. Focused tests cover valid and invalid messages, successful claims and acknowledgements, duplicate delivery prevention, expiry, invalid file submissions, and multi-tab isolation.

#### Recommendation

- Keep `service-worker/sw.ts` as the only manually edited worker implementation.
- Regenerate `public/sw.js` with `npm run build:service-worker` whenever the worker or protocol changes.
- Keep drift verification and lifecycle tests in the root validation workflow.

## Testing and Tooling

### Current observations

- The OCR service has a normal Vitest suite.
- The main application has one root Vitest runner and consistently places application tests under `tests/`. The 15 legacy Node.js test runners and their Log Viewer transpilation harness have been converted into Vitest suites.
- The root suite currently runs 19 test files and 83 tests, including API contracts, Finance contracts, Log Viewer behavior, authorization boundaries, and Finance share lifecycle coverage.
- All Finance source modules are strict TypeScript, while `allowJs` remains enabled in the main TypeScript configuration.
- The pull-request validation workflow runs application lint, type-checking, tests, and builds, plus Finance OCR type-checking, tests, and builds. The OCR package does not yet expose a lint command.
- Phase 1 removed the automatic `predev: npm install`; dependency installation remains an explicit setup step.

### Recommendations

1. Add repository tests around ownership filtering.
2. Add focused service tests for business operations.
3. Add focused UI tests for critical forms and state transitions.
4. Disable `allowJs` after reviewing the remaining JavaScript configuration files.
5. Add an OCR lint command and include it in pull-request validation.

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
2. [ ] Finish continuous integration validation. Pull-request checks cover every currently configured application and OCR validation command; an OCR lint command is still required by the completion gate.
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
5. Maintain end-to-end verification of the scoped Finance share-target boundary.
6. Move initial data loading to server components where practical.

### Phase 5: OCR service boundary

1. Create the shared Finance core package.
2. Move pure shared types and functions into the package.
3. Update the application and OCR service to depend on it.
4. Remove the OCR alias that points to the application root.
5. Validate that the OCR service can build independently.

### Phase 6: PWA boundary

1. Maintain the shared typed service-worker message protocol.
2. Keep service-worker source in the TypeScript build workflow.
3. Maintain focused protocol and lifecycle tests.
4. Generate and verify the deployable `public/sw.js` artifact on every relevant change.

## Architecture Issue Progress Tracker

Summary as of 2026-08-12:

- Done: 12
- In progress: 0
- Partial: 6
- Not started: 4
- Blocked: 0

| ID | Issue | Status | Current evidence and completion gate | Last updated |
| --- | --- | --- | --- | --- |
| AC-001 | Documentation and scoped guidance drift | **Done** | Added the four referenced scoped guides, aligned README routes and module ownership, documented current boundaries, and refreshed framework versions, test organization, naming, file-size evidence, and CI status after later cleanup. | 2026-08-12 |
| AC-002 | Missing CI validation workflow | **Partial** | `.github/workflows/validate.yml` runs application audit, lint, typecheck, the complete Vitest suite, and build on pull requests. It also runs OCR audit, typecheck, tests, and build. Done when the OCR package has a lint command and CI runs it, satisfying the full documented gate. | 2026-08-12 |
| AC-003 | `predev` installs dependencies | **Done** | Removed the `predev` script. Setup continues to require an explicit `npm install`, and no dependency or lockfile change was needed. | 2026-08-02 |
| AC-004 | No-op route layouts | **Done** | Removed all eleven layouts that only returned `children`. The root layout and Finance authorization layout remain. | 2026-08-02 |
| AC-005 | Legacy redirect route noise | **Done** | Removed five unused legacy routes after verifying PWA, Auth, and Film navigation use canonical paths. Retained and documented `/api-tools` because Supabase module metadata actively supplies it to runtime navigation. | 2026-08-02 |
| AC-006 | Main-app test organization | **Done** | Converted all 15 legacy `scripts/test-*.js` runners and the Log Viewer transpilation harness into top-level Vitest suites, removed the obsolete runners, and simplified CI to execute the complete suite once through `npm test`. The suite passes 19 files and 83 tests, and `npx tsc --noEmit` passes. | 2026-08-12 |
| AC-007 | Remaining Finance JavaScript and `allowJs` | **Partial** | Converted all four Finance source modules to strict TypeScript and updated their focused test runners. Root TypeScript still enables `allowJs`. Done when `allowJs` is disabled without breaking the build or tests. | 2026-08-05 |
| AC-008 | Domain type monolith | **Not started** | `lib/types.ts` is about 602 lines and has about 81 direct importers. Done when domain types and runtime configuration have clear owners and cross-domain imports no longer depend on a monolith. | 2026-08-12 |
| AC-009 | Untyped Supabase schema boundary | **Not started** | Supabase clients have no generated `Database` generic. Done when one reviewed generated type parameterizes browser, server, and admin clients and is refreshed with schema changes. | 2026-08-02 |
| AC-010 | Inconsistent API errors and validation | **Partial** | Domain request parsers now cover Finance, Film, Tickets, Projects, Logs, Notes, API keys, and Project ingestion. Projects are the shared-contract pilot: `lib/api/` defines typed success and error envelopes, `/api/projects` returns stable error codes and optional field errors, and the Project client and forms consume them. Other features, pagination conventions, and operational logging still vary. Done when those transport contracts are documented and standardized with tests. | 2026-08-06 |
| AC-011 | Missing typed feature clients | **Done** | Finance and Tickets already had reusable client APIs. Film, Projects, Logs, Notes, and API keys now use domain-owned browser clients; the Log export action also uses the Logs client. `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass. | 2026-08-05 |
| AC-012 | Direct data access in route handlers | **Done** | A repository-wide route scan finds no `createAdminClient()`, `.from()`, `.rpc()`, or `.storage` calls in `app/api/`. Service-role queries now live in owned repositories, and routes act as HTTP adapters. `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass. | 2026-08-05 |
| AC-013 | Inconsistent business-service layer | **Partial** | Finance, Film, Tickets, Notes, and API keys now use explicit services for non-trivial operations. Projects remain deliberately repository-only for simple CRUD, and Logs retain their authorization-aware access layer. Focused service behavior coverage is still uneven. Done when business operations have focused service tests. | 2026-08-05 |
| AC-014 | Monolithic OpenAPI definition | **Done** | The documented Logs, Projects/Ingest, Tickets, and Film paths now live in separate `lib/openapi/` domain modules. `index.ts` composes the final specification, and `npm run test:openapi` verifies its path and composition contract. | 2026-08-05 |
| AC-015 | Large page and client-component responsibilities | **Partial** | Some Film sections are extracted, but Film roll detail, Access Control, and Finance review remain large stateful files. Done when state, mutations, dialogs, and sections have focused ownership and regression coverage. | 2026-08-02 |
| AC-016 | Overloaded application shell | **Partial** | Extracted canonical module route mapping and matching into client-safe `lib/rbac/routes.ts`, used by `AppShell` authorization and Sidebar navigation activity. `AppShell` still owns project loading, navigation, responsive behavior, spacing, and loading UI. Done when protected layout, page container, loading state, and mobile navigation responsibilities are explicit. | 2026-08-02 |
| AC-017 | Client-heavy initial data loading | **Not started** | 26 of 33 remaining pages are client components and 24 pages use `useEffect()`. Done when practical initial reads move to server components and interactive client islands retain only browser state. | 2026-08-02 |
| AC-018 | Component ownership ambiguity | **Done** | Shared atoms, molecules, and layout organisms remain under `components/`; route-owned sections live in route `_components/` directories. Ticket workflows moved from shared organisms into `app/tickets/_components/`, with the Project detail route consuming the Ticket-owned implementation where needed. Focused ESLint validation passes and the moved implementations are unchanged. | 2026-08-12 |
| AC-019 | Inconsistent non-route naming | **Done** | Renamed the remaining camelCase domain directories to `lib/article-creation/` and `lib/log-viewer/`, updated application, library, test, and PRD references, and retained the documented lowercase, kebab-case, and domain `core/` conventions. Focused ESLint and `git diff --check` pass with no active stale imports. | 2026-08-12 |
| AC-020 | Global Finance share-target provider | **Done** | Accepted file state lives under the protected Finance layout and is discarded when that layout unmounts. A narrow global rejection bridge handles signed-out and unauthorized shares without adding Finance behavior to `AccessProvider`. Automated React lifecycle and service-worker tests cover authenticated success, signed-out and unauthorized rejection, expiry, navigation disposal, and multi-tab isolation. | 2026-08-11 |
| AC-021 | OCR service source coupling | **Not started** | The OCR TypeScript and bundler aliases point to the application root. Done when both runtimes depend on an explicit shared package and OCR builds without application-source aliases. | 2026-08-02 |
| AC-022 | Untyped service-worker workflow | **Done** | `service-worker/sw.ts` consumes the shared Finance protocol and runtime client-message parser, passes its Web Worker-specific typecheck, and bundles reproducibly into generated `public/sw.js`. Build and test scripts verify source/output drift, the workflow is documented, and focused tests cover valid and invalid messages, acknowledgement, duplicate prevention, expiry, invalid submissions, navigation disposal, and multi-tab isolation. | 2026-08-12 |

## Final Assessment

The repository does not need a complete rewrite or a single large restructuring effort. Its strongest path forward is incremental standardization:

- Give every feature the same internal layers.
- Keep framework route files thin.
- Place types and runtime configuration with their owning domains.
- Separate browser, server, persistence, and presentation responsibilities.
- Make the OCR service dependency boundary explicit.
- Use automated tests and CI to protect each refactoring step.

Phase 1 documentation and low-risk structure cleanup is complete except for adding OCR lint to the existing CI workflow. The next work should be type ownership, generated Supabase types, API contract consistency, and focused service tests. Large UI decomposition, protected-shell separation, server-loaded page reads, and OCR package extraction should come afterward because they carry more integration risk.
