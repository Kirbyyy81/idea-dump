# Film Library Guide

## Scope

- Apply this guide to everything under `lib/film/`.

## Ownership

- Keep the feature-wide browser client, request schemas, repository, service, API helpers, cover handling, and Film constants at this level.
- Keep Film Roll lifecycle helpers in `rolls/`.
- Keep external provider integrations in `integrations/`. Provider modules are server-only in practice and must not expose access tokens, refresh tokens, Storage paths, or raw provider errors.
- Keep Film domain types in `lib/types.ts` until the reviewed domain-type migration changes that repository-wide rule.

## Boundaries

- Route handlers authorize through `authorizeFilmJournal`, parse with `schemas.ts`, and delegate domain behavior to `service.ts`.
- Repositories must scope every query and mutation to the authenticated user ID.
- `client.ts` is browser-only. Do not import Supabase admin, server credentials, or server-only provider modules into it.
- Keep normalization, workflow transitions, and validation pure where possible.
