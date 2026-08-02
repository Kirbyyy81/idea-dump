# RBAC Guide

## Scope

- Apply this guide to everything under `lib/rbac/`.
- Follow the root and `lib/AGENTS.md` guides together with this file.

## Responsibilities

- Keep module and built-in role slugs in `constants.ts`.
- Keep RBAC data structures in `types.ts`.
- Keep session lookup, role resolution, module metadata, overrides, and access calculation in `access.ts`.
- Keep route-facing authorization helpers and standard unauthorized or forbidden responses in `guards.ts`.
- Add a new application module only with its database metadata, route-access mapping, and authorization coverage reviewed together.

## Security Invariants

- Resolve access from the authenticated user or verified API-key identity. Never trust request-provided roles, user IDs, module lists, or override effects.
- Preserve always-allowed module behavior and explicit user deny or allow overrides.
- Validate database-provided navigation paths as safe internal paths before exposing them to the client.
- Use the shared server and admin Supabase clients. Do not create an inline client or expose service-role credentials.
- Scope user-specific RBAC queries to the verified user. Broader role and module metadata reads must remain limited to trusted server code.
- API routes must authorize independently because middleware does not cover `/api`.

## Change Discipline

- Keep authorization helpers small and composable. Domain wrappers may add checks but must not bypass the shared guards.
- Treat changes to module slugs, default roles, always-allowed behavior, manager access, or override precedence as security-sensitive.
- Update repository guidance and the architecture progress tracker when changing RBAC boundaries or ownership.

## Validation

- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Exercise unauthenticated, forbidden, allowed, manager, and per-user override cases for affected modules.
