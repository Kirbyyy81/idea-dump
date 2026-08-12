# API Route Guide

## Scope

- Apply this guide to all route handlers under `app/api/`.
- Follow the root `AGENTS.md`. Use the more specific `lib/rbac/AGENTS.md` when changing authorization helpers.

## Route Responsibilities

- Keep route handlers focused on authorization, request parsing, validation, calling domain logic, and mapping results to HTTP responses.
- Prefer domain repositories and services over adding more direct persistence behavior to route files.
- Parse request bodies as `unknown` and validate their shape before using fields.
- Validate path parameters, query parameters, identifiers, enums, lengths, numeric bounds, and dates at the transport boundary.
- Preserve established response contracts unless the related clients and OpenAPI specification change together.

## Authentication and Authorization

- Use `authorizeSessionModule` for browser-session module routes.
- Use `resolveIdentity` followed by `authorizeIdentityModule` for endpoints that support both sessions and API keys.
- Use `authorizeFilmJournal` for Film routes.
- Use `authorizeFinance` for Finance routes, including its mutation request-security checks.
- Do not rely on middleware for API authorization because the middleware matcher excludes `/api`.
- Never accept user IDs, roles, ownership, or authorization decisions from request-controlled fields.

## Supabase and Security

- Reuse the clients in `lib/supabase/`. Do not construct an inline Supabase client.
- Authenticate and authorize before creating or using a service-role client.
- Scope every application-table query and mutation to the verified user unless an explicitly reviewed manager operation requires a broader scope.
- Keep service-role keys, access tokens, API keys, signed URLs, OCR text, and private Storage paths out of responses and logs.
- Use reviewed RPCs for workflows that rely on locking, idempotency, fencing, duplicate handling, or cleanup invariants.

## Errors and Logging

- Return JSON errors with an appropriate status and a stable user-safe message.
- Do not expose raw database or provider errors to clients.
- Log enough route and stage context to diagnose failures without logging secrets or private payloads.

## Validation

- Run the smallest relevant regression scripts while iterating.
- Before handoff, run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
