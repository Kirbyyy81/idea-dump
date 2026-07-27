# Finance OCR service

Native Node 22 service for Finance screenshot OCR on Render. It supports the ordinary direct, authenticated upload and the durable Android share-batch queue. Both paths share one OCR slot and one lazily initialized Tesseract worker, while fenced Supabase RPCs remain the authoritative processing boundary.

## Runtime contract

- `GET /health` returns `{ "status": "ok" }` without initializing OCR.
- `POST /warm` requires `Authorization: Bearer <Supabase access token>`, verifies Finance access, rate-limits the verified user, and calls the same `ensureWorkerReady()` promise used by OCR.
- `POST /v1/finance/ocr` requires the same authorization and one multipart file in the `screenshot` field.
- `POST /v1/finance/queue/wake` requires the server-only `FINANCE_QUEUE_WAKE_SECRET`. It returns `202` after starting or joining one background drain; it does not claim that queued work completed.
- Success is `{ "data": { "intake": {}, "candidate": {}, "transaction": null, "auto_confirmed": false, "recovered": false } }`.
- Errors are `{ "code": "...", "message": "...", "retryable": false, "request_id": "...", "retry_after_seconds": 5 }`.

The ordinary direct-upload path always creates or recovers a review candidate. Auto-confirmation remains disabled there. A queued share candidate may use the existing automatic-confirmation RPC only when every current Finance safeguard passes.

## Supabase boundary

The service uses two isolated clients:

1. `SUPABASE_PUBLISHABLE_KEY` is used only for the network-verified `auth.getUser(accessToken)` call.
2. `SUPABASE_SECRET_KEY` is used only after authentication and Finance authorization, with every RPC/query explicitly scoped by the verified user ID.

Required service-only functions:

- `finance_user_can_access_module_v1`
- `finance_begin_screenshot_intake_v2`
- `finance_finalize_screenshot_intake_v2`
- `finance_fail_screenshot_intake_v2`
- `finance_claim_share_queue_item_v1`
- `finance_retry_share_queue_item_v1`
- `finance_complete_share_queue_item_v1`
- `finance_cleanup_share_batch_v1`
- `finance_confirm_candidate`

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

Set `ALLOWED_ORIGINS` to exact origins. Wildcards are rejected at startup. The checked-in example and Render Blueprint include production plus the explicit `http://localhost:3000` development origin.

Queue configuration:

- `FINANCE_SHARE_BUCKET` defaults to the private `finance-share-batches` bucket.
- `FINANCE_SHARE_QUEUE` defaults to the durable `finance_share_ocr` Basic Queue.
- `FINANCE_QUEUE_VISIBILITY_SECONDS` defaults to 120 seconds beyond the intake lease and must retain at least a 30-second margin.
- `FINANCE_QUEUE_WAKE_SECRET` is required, must contain at least 32 bytes, and must match the server-only value used by the Next.js wake caller.

Never expose the wake secret, Storage credentials, unrestricted Queue access, or Supabase secret key through a `NEXT_PUBLIC_` variable.

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
- Direct and queued work share one OCR slot. A second simultaneous direct request receives `503` and `Retry-After`; the queue consumer claims one item only after the slot is available.
- Per-user request limits return `429` and `Retry-After`.
- Worker failures terminate and clear the cached worker so a later warm/request can initialize a fresh worker.
- Logs contain request IDs, safe stage/code data, intake and transient identifiers, durations, and recovery state-not screenshots, Storage paths, tokens, API keys, signed URLs, or OCR text.
- Queued items are downloaded only from the authoritative private path returned by the claim RPC and are revalidated before OCR.
- A recoverable first queue attempt retries immediately. Database leases and fencing enforce the two-attempt maximum and safe redelivery.
- Exact-image duplicates skip OCR. Terminal completion removes a queue message only after the durable Finance result and transient item status are committed.
- When the final item becomes terminal, the consumer deletes and verifies every temporary object before removing transient batch state. Failed cleanup remains available to a later recovery wake.
- Ordinary direct-upload bytes remain in browser/request memory only. Confirmed Android share-batch bytes use temporary private Supabase Storage and are deleted at terminal batch cleanup.
