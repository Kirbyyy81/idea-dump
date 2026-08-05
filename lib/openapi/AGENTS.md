# OpenAPI Guide

## Scope

- Apply this guide to `lib/openapi/`.
- Keep `index.ts` limited to composing the top-level OpenAPI document.

## Ownership

- Put route definitions in the domain module that owns their behavior, such as `logs.ts`, `projects.ts`, `tickets.ts`, or `film.ts`.
- Add a new domain module when that domain gains documented endpoints. Do not append endpoint definitions directly to `index.ts`.
- Keep reusable OpenAPI schemas and security schemes in `components.ts`.
- Preserve the public output of `getOpenApiSpec()` when reorganizing definitions. Update contract checks whenever a documented route is added, changed, or removed.
