# Film Library Guide

## Scope

- Apply this guide to everything under `lib/film/`.

## Ownership

- Keep the Film-wide browser client, request schemas, repository, service, API helpers, constants, and validation in `core/`.
- Keep the cover capability at this level until it needs more than its focused module.
- Keep Film Roll lifecycle helpers in `rolls/`.
- Keep external provider integrations in `integrations/`. Provider modules are server-only in practice and must not expose access tokens, refresh tokens, Storage paths, or raw provider errors.
- Keep Film domain types in `lib/types.ts` until the reviewed domain-type migration changes that repository-wide rule.

## Boundaries

- Route handlers authorize through `authorizeFilmJournal`, parse with `schemas.ts`, and delegate domain behavior to `service.ts`.
- Repositories must scope every query and mutation to the authenticated user ID.
- `client.ts` is browser-only. Do not import Supabase admin, server credentials, or server-only provider modules into it.
- Keep normalization, workflow transitions, and validation pure where possible.
- Build browser responses through the explicit field allowlists in `core/responses.ts`. Keep database records separate from the view types in `lib/types.ts`, and update the client and OpenAPI contract together.
- Gallery and cover-photo previews use the authenticated photo image endpoint with `size=thumbnail`; original images load only when opened. Resolve expiring thumbnail links server-side, verify every redirect target, and keep browser caches private and varied by credentials.
- A successful Drive sync sets `frames_taken` to the number of distinct supported images directly in the linked folder, including zero for an empty folder. Fetch every Drive result page before persisting changes; failed or incomplete listings must not replace the frame count or remove saved photos. Resyncing replaces any manually entered frame count.
