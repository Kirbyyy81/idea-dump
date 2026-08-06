# Finance Domain Guide

## Scope

- Apply this guide to all code under `lib/finance/`.
- Follow the repository and `lib/AGENTS.md` guides first.

## Structure

- `lib/finance/` is the Finance feature root. Keep concise Finance capabilities at this level, including catalog, rules, review, and dashboard.
- `core/` owns Finance-wide authorization, request security, browser requests, constants, values, schemas, repository access, and cross-capability services. Do not create duplicate common layers beside a capability module.
- Use a nested directory only for a substantial Finance subsystem with several collaborating modules:
  - `transactions/` owns transaction-specific validation, persistence, ordering, idempotency, and duplicate analysis.
  - `ocr/` owns OCR parsing, normalization, source detection, and the OCR client.
  - `share/` owns PWA share-batch validation, upload preparation, browser handoff, and server handoff.
- Do not add a directory for a small capability merely to reproduce `schemas.ts`, `repository.ts`, and `service.ts` everywhere.
- Keep browser-only Finance code in `core/client.ts`, `catalogClient.ts`, or `share/client.ts`, each marked with `'use client'` where browser APIs are used.

## Runtime and Security

- Keep OCR parsing and normalization independent of React, browser APIs, Next.js runtime APIs, and application credentials because `services/finance-ocr/` imports them.
- Keep service-role queries in `core/repository.ts` or reviewed server-side helpers, with explicit verified-user filters.
- Preserve Finance mutation request security, idempotency, share-storage verification, and reviewed RPC workflows when moving code.

## Validation

- Run `npm run test:finance-security`, `npm run test:finance-idempotency`, `npm run test:finance-ordering`, and `npm run test:finance-share` after Finance structural changes.
- When code shared with the OCR service changes, also run the Finance OCR validation from `services/finance-ocr/`.
