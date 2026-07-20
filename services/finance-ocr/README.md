# Finance OCR service

Native Node 22 service for direct, authenticated Finance screenshot OCR on Render. It keeps screenshot bytes in request memory only, admits one OCR request at a time, reuses one lazily initialized Tesseract worker, and persists only derived Finance data through fenced Supabase RPCs.

## Runtime contract

- `GET /health` returns `{ "status": "ok" }` without initializing OCR.
- `POST /warm` requires `Authorization: Bearer <Supabase access token>`, verifies Finance access, rate-limits the verified user, and calls the same `ensureWorkerReady()` promise used by OCR.
- `POST /v1/finance/ocr` requires the same authorization and one multipart file in the `screenshot` field.
- Success is `{ "data": { "intake": {}, "candidate": {}, "transaction": null, "auto_confirmed": false, "recovered": false } }`.
- Errors are `{ "code": "...", "message": "...", "retryable": false, "request_id": "...", "retry_after_seconds": 5 }`.

The launch path always creates or recovers a review candidate. Auto-confirmation is deliberately disabled.

## Supabase boundary

The service uses two isolated clients:

1. `SUPABASE_PUBLISHABLE_KEY` is used only for the network-verified `auth.getUser(accessToken)` call.
2. `SUPABASE_SECRET_KEY` is used only after authentication and Finance authorization, with every RPC/query explicitly scoped by the verified user ID.

Required service-only functions:

- `finance_user_can_access_module_v1`
- `finance_begin_screenshot_intake_v2`
- `finance_finalize_screenshot_intake_v2`
- `finance_fail_screenshot_intake_v2`

The secret key must only exist in Render environment secrets. Never prefix it with `NEXT_PUBLIC_`, commit it, or send it to the browser.

## Local development

Use Node 22.22.x. The Render Blueprint pins the same major and minor line.

```powershell
Copy-Item .env.example .env
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Set `ALLOWED_ORIGINS` to exact origins. Wildcards are rejected at startup. The checked-in example includes production and one explicit localhost origin; the Render Blueprint config permits production only.

## Benchmark

The benchmark validates and fully decodes each fixture, warms the same Tesseract worker, runs sequential OCR, and reports timings, dimensions, byte counts, output character counts, and RSS. It does not connect to Supabase or print OCR text.

```powershell
$env:BENCHMARK_ITERATIONS='3'
npm run benchmark -- C:\path\to\ryt-bank.png
```

Run the supplied Ryt Bank fixtures on the Render Free service before finalizing `MAX_IMAGE_PIXELS`, `INTAKE_LEASE_SECONDS`, or user-facing latency expectations.

The Render build runs from the repository root because the bundle imports the shared pure Finance parser, normalizer, source-detection logic, constants, and types. The build command installs only this service's lockfile and emits a self-contained service bundle; do not set a Render `rootDir`, because Render excludes files outside a configured root directory.

## Operational behavior

- Accepted input: PNG, JPEG, or WebP; maximum 4 MB by default.
- Magic bytes must match the declared MIME type.
- Sharp fully decodes the image under dimension and pixel limits before OCR.
- A second simultaneous OCR request receives `503` and `Retry-After`; it is never queued in memory.
- Per-user request limits return `429` and `Retry-After`.
- Worker failures terminate and clear the cached worker so a later warm/request can initialize a fresh worker.
- Logs contain request IDs, safe stage/code data, intake IDs, durations, and recovery state—not screenshots, tokens, API keys, or OCR text.
- Render disk and Supabase Storage are not used for screenshots.
