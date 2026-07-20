# Render Finance OCR Integration Runbook

## Purpose

This runbook explains how to connect the IdeaDump Finance OCR service to Render, Supabase, Vercel, and the browser application.

The implementation is designed for a coordinated full rollout:

1. Prepare Supabase with the fenced OCR intake migration.
2. Deploy and validate the Render service.
3. Configure and deploy the browser application.
4. Run the end-to-end acceptance checks.
5. Switch production traffic only after all checks pass.
6. Drop the old processing-event table only after the legacy route has drained.

The current design does not store screenshots in Supabase Storage or on Render disk. Screenshot bytes are uploaded directly from the browser, processed in Render memory, and discarded after the request.

## Architecture

```text
Signed-in browser
  -> reads the current Supabase user access token
  -> POSTs screenshot directly to Render

Render Finance OCR service
  -> validates the user token with Supabase Auth
  -> verifies Finance module access
  -> validates and decodes the image
  -> runs OCR, parsing, source detection, and duplicate assessment
  -> writes through service-only, user-fenced Supabase RPCs
  -> returns the review candidate

Browser
  -> opens the new Finance review candidate
```

## Repository and Build Context

The Render service uses code from both its own directory and the shared Finance libraries:

```text
idea-dump/
|-- render.yaml
|-- lib/
|   |-- finance/
|   `-- types.ts
`-- services/
    `-- finance-ocr/
        |-- package.json
        |-- package-lock.json
        |-- src/
        |-- test/
        `-- dist/                 generated during the Render build
```

Render must therefore use the repository root as its build context.

### Required Render directory setting

Leave **Root Directory blank** in Render. Do not set it to `services/finance-ocr`.

Render makes files outside a configured root directory unavailable at build time and runtime. The OCR build imports the shared parser, normalizer, constants, source detection, and types from the root `lib` directory. The checked-in Blueprint deliberately omits `rootDir`, so Render defaults to the repository root.

The Blueprint uses these commands:

```text
Build: cd services/finance-ocr && npm ci && npm run build
Start: cd services/finance-ocr && npm start
```

During the build, `tsup` bundles the shared Finance modules into `services/finance-ocr/dist/server.js`. The running service executes that bundle and does not dynamically load source files from `lib` for each request.

Official reference: [Render monorepo support](https://render.com/docs/monorepo-support).

## Prerequisites

Before connecting production traffic, confirm all of the following:

- The target Git branch contains `render.yaml`, `services/finance-ocr`, and the Render OCR commits.
- The Render workspace still offers a Free web service.
- The service will be created in Singapore.
- The Supabase project URL and current API keys are available.
- A dedicated Supabase secret key can be created for this Render service.
- The Supabase migration has been reviewed but has not been bypassed with ad hoc production SQL.
- The production browser origin is `https://idea-dump-alpha.vercel.app`, or `ALLOWED_ORIGINS` is updated to the actual production origin.
- Representative Ryt Bank screenshots are available for the acceptance test.

## Step 1: Prepare Supabase

Apply the committed migration through the project's normal Supabase migration deployment workflow:

```text
supabase/migrations/20260715091429_render_ocr_intake_leases.sql
```

The migration:

- adds processing-attempt, lease, retry, version, and failure-state fields to `finance_intake_items`
- makes the existing stale processing intake reclaimable
- adds service-only Finance authorization, begin, finalize, and fail RPCs
- fences finalization and failure writes by verified user, intake, and attempt token
- finalizes the intake and review candidate atomically
- removes processing-event writes from the retained Finance RPCs
- preserves a temporary legacy intake shape for safe coordinated deployment
- leaves `finance_processing_events` in place until the old deployed upload route has drained

Required service-only RPCs:

```text
finance_user_can_access_module_v1
finance_begin_screenshot_intake_v2
finance_finalize_screenshot_intake_v2
finance_fail_screenshot_intake_v2
```

After applying the migration, verify:

- all four functions exist with the expected signatures
- only `service_role` can execute them
- `PUBLIC`, `anon`, and `authenticated` cannot execute them
- the functions are `SECURITY INVOKER` with a fixed empty search path
- the active-lease partial index exists
- Supabase Security and Performance Advisors have no new finding caused by the migration

Do not drop `finance_processing_events` during this step.

## Step 2: Create Supabase Keys for Render

Open Supabase Dashboard, then use the project Connect dialog or **Project Settings -> API Keys**.

Create or obtain:

| Render variable | Recommended value | Exposure |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Render only |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Low-privilege application key |
| `SUPABASE_SECRET_KEY` | A dedicated `sb_secret_...` for Finance OCR | Render secret only |

The service uses the publishable key only to call `auth.getUser(accessToken)`. The bearer value supplied by the browser is the signed-in user's access token, not the publishable key.

The secret client is used only after user authentication and Finance authorization. A Supabase secret key maps to elevated `service_role` access and bypasses RLS, so it must never be:

- committed to Git
- placed in a `NEXT_PUBLIC_` variable
- configured in Vercel browser environment variables
- sent to the browser
- included in URLs, screenshots, logs, or support messages

Prefer a separate secret key for this Render service so it can be rotated independently. Supabase recommends publishable and secret keys over the legacy `anon` and `service_role` keys.

Official references:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase `auth.getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)

## Step 3: Create the Render Service

### Preferred: Blueprint deployment

1. Push the target branch to the Git provider.
2. In Render, create a new Blueprint.
3. Connect the `idea-dump` repository.
4. Select or confirm the branch containing this implementation.
5. Confirm Render detects the root `render.yaml`.
6. Leave **Root Directory blank**.
7. Confirm the service type is **Web Service**, runtime is **Node**, plan is **Free**, and region is **Singapore**.
8. Enter the three prompted Supabase variables. They use `sync: false` in the Blueprint and are not stored in Git.
9. Create the service and wait for the first deployment.

The committed Blueprint configures:

```yaml
type: web
runtime: node
plan: free
region: singapore
healthCheckPath: /health
maxShutdownDelaySeconds: 120
```

It pins Node `22.22.0` and starts with one Render instance.

### Manual service equivalent

If the Blueprint workflow is unavailable, use these exact settings:

| Setting | Value |
| --- | --- |
| Service type | Web Service |
| Runtime | Node |
| Plan | Free |
| Region | Singapore |
| Root Directory | Leave blank |
| Build command | `cd services/finance-ocr && npm ci && npm run build` |
| Start command | `cd services/finance-ocr && npm start` |
| Health check | `/health` |
| Node version | `22.22.0` |

The Blueprint remains the preferred source of truth. If a setting is changed manually, reconcile it with `render.yaml` so the next Blueprint sync does not unexpectedly reverse it.

## Step 4: Configure Render Environment Variables

The Blueprint supplies safe defaults for limits and prompts for secrets.

| Variable | Production value or default | Purpose |
| --- | --- | --- |
| `NODE_VERSION` | `22.22.0` | Reproducible native Node runtime |
| `HOST` | `0.0.0.0` | Listen on the Render network interface |
| `LOG_LEVEL` | `info` | Redacted structured logs |
| `ALLOWED_ORIGINS` | `https://idea-dump-alpha.vercel.app` | Strict browser CORS allow-list |
| `MAX_IMAGE_BYTES` | `4194304` | 4 MB image limit |
| `MAX_REQUEST_BYTES` | `4456448` | Multipart request limit |
| `MAX_IMAGE_DIMENSION` | `12000` | Maximum width and height |
| `MAX_IMAGE_PIXELS` | `25000000` | Maximum decoded pixels |
| `PROCESSING_VERSION` | `2` | Stored processing contract version |
| `INTAKE_LEASE_SECONDS` | `300` | Five-minute recovery lease |
| `OCR_RATE_LIMIT_WINDOW_SECONDS` | `60` | Per-user rate-limit window |
| `OCR_RATE_LIMIT_MAX_REQUESTS` | `4` | OCR requests per user per window |
| `WARM_RATE_LIMIT_MAX_REQUESTS` | `6` | Warm requests per user per window |
| `OCR_BUSY_RETRY_AFTER_SECONDS` | `5` | Busy response retry guidance |

`ALLOWED_ORIGINS` accepts a comma-separated list of exact origins. Do not use `*`.

Examples:

```text
# Production only
ALLOWED_ORIGINS=https://idea-dump-alpha.vercel.app

# Temporary fixed preview plus production
ALLOWED_ORIGINS=https://idea-dump-alpha.vercel.app,https://<fixed-preview-host>

# Local service development
ALLOWED_ORIGINS=http://localhost:3000
```

Vercel preview hosts can change. Add only the exact preview origin being tested, then remove it when testing is complete.

## Step 5: Validate the Render Deployment

### Health check

Set the deployed service URL without a trailing slash:

```powershell
$env:FINANCE_OCR_URL = 'https://<service-name>.onrender.com'
Invoke-RestMethod "$env:FINANCE_OCR_URL/health"
```

Expected response:

```json
{
  "status": "ok"
}
```

`/health` verifies the Node process only. It does not initialize the Tesseract worker.

### Authenticated warm check

Use a short-lived access token belonging to a user who currently has Finance module access. Keep the token in a temporary environment variable and never commit or log it.

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" }
Invoke-RestMethod -Method Post -Uri "$env:FINANCE_OCR_URL/warm" -Headers $headers
```

Expected response:

```json
{
  "data": {
    "ready": true
  }
}
```

Expected negative checks:

| Check | Expected result |
| --- | --- |
| No bearer token | `401` |
| Invalid or expired user token | `401` |
| Valid user without Finance access | `403` |
| Disallowed browser origin | No CORS permission and a rejected request |
| Repeated warm calls over the limit | `429` with `Retry-After` |

### Direct OCR smoke test

Use a non-production test account with Finance access and an accepted PNG, JPEG, or WebP fixture no larger than 4 MB:

```powershell
curl.exe -X POST "$env:FINANCE_OCR_URL/v1/finance/ocr" `
  -H "Authorization: Bearer $env:SUPABASE_ACCESS_TOKEN" `
  -F "screenshot=@C:\path\to\ryt-bank.png;type=image/png"
```

A new screenshot should return HTTP `201` with a pending review candidate. A retry of an already finalized screenshot should recover the existing lineage instead of creating another candidate or transaction.

Do not paste a real user access token into documentation, Git, Render logs, screenshots, or chat messages.

## Step 6: Connect Vercel and the Browser

After Render passes its service checks, copy the Render HTTPS origin and set this Vercel environment variable:

```text
NEXT_PUBLIC_FINANCE_OCR_URL=https://<service-name>.onrender.com
```

Configure it for the Vercel environment being tested, then redeploy the Next.js application. `NEXT_PUBLIC_` variables are embedded into the browser build, so changing the value without a redeployment is insufficient.

The browser then:

1. reads the current Supabase session
2. sends the access token in `Authorization: Bearer <user-access-token>`
3. uploads the screenshot directly to Render as `multipart/form-data`
4. shows Uploading, Reading screenshot, and Preparing review phases
5. navigates to the returned review candidate

The screenshot does not pass through the Next.js upload route.

## Step 7: End-to-End Acceptance Test

Complete all checks before production cutover:

- Sign in as a user with Finance access.
- Open Finance -> Add transaction -> Screenshot.
- Confirm the non-blocking warm request does not delay page navigation.
- Upload a representative Ryt Bank screenshot.
- Confirm the browser sends the image to the Render origin, not `/api/finance/upload`.
- Confirm Uploading, Reading screenshot, and Preparing review are shown truthfully.
- Confirm the returned candidate opens directly in Finance review.
- Confirm filename evidence is retained but cannot select a source by itself.
- Confirm conflicting source signals leave the source unresolved.
- Confirm the screenshot is not present in Supabase Storage or Render disk.
- Upload the same screenshot again and confirm no second candidate or ledger transaction is created.
- Interrupt a request after intake creation, wait for lease expiry, then confirm manual re-upload reclaims the same intake lineage.
- Submit simultaneous OCR requests and confirm excess work receives `503` with `Retry-After` instead of waiting in an in-memory queue.
- Exceed the per-user request rate and confirm `429` with `Retry-After`.
- Confirm a user without Finance access receives `403` before OCR.
- Review Render logs and confirm they contain no screenshot bytes, bearer tokens, API keys, or full OCR text.
- Confirm manual Finance entry remains usable when Render OCR is unavailable.

Record cold-start, worker-initialization, warm OCR, total response, and memory observations before changing the 25-million-pixel limit or promising a user-facing processing time.

## Production Cutover Order

Use this order to avoid a partially migrated production path:

1. Confirm application and Render service tests pass.
2. Apply and verify the Supabase preparation migration.
3. Deploy Render and verify `/health`, `/warm`, authentication, authorization, and an OCR test.
4. Configure `NEXT_PUBLIC_FINANCE_OCR_URL` in Vercel.
5. Deploy the complete browser cutover.
6. Confirm production browser traffic goes directly to Render.
7. Drain any request that entered the previously deployed Next.js OCR route.
8. Verify no application, function, trigger, job, or recovery path still writes `finance_processing_events`.
9. Create and apply a separate post-cutover migration that drops `finance_processing_events` without `CASCADE`.
10. Rerun Supabase Security and Performance Advisors.

Do not deploy only the browser change before the migration and Render service are ready. Do not retain the old Next.js OCR route as an automatic fallback.

## Event-Table Cleanup

The preparation migration intentionally does not drop `finance_processing_events`. Dropping it before the old production route has drained could break an in-flight upload.

Before creating the cleanup migration:

1. Confirm the new browser deployment is active for all users.
2. Confirm the old upload route has no in-flight request.
3. Search application code for remaining writers:

   ```powershell
   rg "finance_processing_events" app lib services
   ```

4. Inspect live function definitions, triggers, scheduled jobs, and recovery scripts for table references.
5. Verify the preparation migration rewrote the five retained Finance RPCs without event inserts.
6. Create the cleanup migration using the current Supabase CLI workflow.
7. Drop the table without `CASCADE`; an unexpected dependency must stop the cleanup for investigation.
8. Verify the live schema and rerun advisors.

## Failure and Rollback Behavior

If Render fails before browser cutover, keep the current production browser deployment unchanged while diagnosing the service.

If OCR must be disabled after cutover:

- preserve manual Finance entry
- disable or remove the public OCR endpoint configuration and redeploy the browser
- do not proxy failed uploads back through Next.js
- do not restore a dropped processing-event table as an OCR fallback
- do not assume interrupted screenshots will continue processing in the background

If the browser loses the response after Render has committed the candidate, retrying the same screenshot should recover the existing result through the image hash and intake state.

## Troubleshooting

### Render cannot resolve `@/lib/...`

Cause: Render Root Directory was set to `services/finance-ocr`, so the root `lib` directory is unavailable.

Fix:

- clear the Root Directory setting
- confirm the build runs from the repository root
- use `cd services/finance-ocr && npm ci && npm run build`

### `npm ci` reports a Node engine mismatch

Confirm Render is using Node `22.22.0` from `NODE_VERSION`. The service package requires Node 22.22.x.

### `/health` works but `/warm` returns `401`

`/health` is intentionally public. `/warm` requires a current Supabase user access token, not the publishable key, secret key, or refresh token.

### `/warm` or OCR returns `403`

The token is valid, but the verified user does not currently have Finance module access. Check the authoritative RBAC assignment and overrides in Supabase. Do not grant access through user-editable metadata.

### Browser reports a CORS failure

Compare the browser's exact `Origin` header with `ALLOWED_ORIGINS`. Include the scheme, hostname, and non-default port. Do not add a wildcard.

### OCR returns `503`

Possible causes include:

- the single OCR slot is occupied
- the worker is initializing or recovering
- Supabase Auth or persistence is temporarily unavailable
- Render is waking after free-tier idle spin-down

Honor `Retry-After` and retry manually. Do not create an in-memory backlog.

### OCR returns `429`

The verified user exceeded the configured fixed-window request limit. Honor `Retry-After`. The browser deliberately does not replay the screenshot automatically.

### Duplicate upload returns the existing candidate

This is expected idempotent recovery. The same per-user image hash maps to the existing intake lineage.

### Render build succeeds but shared-code changes do not redeploy

Confirm no Render Root Directory excludes `lib`, and review any configured build filters. If build filters are added, they must include at least:

```text
services/finance-ocr/**
lib/finance/**
lib/types.ts
render.yaml
```

## Security Checklist

- Keep `SUPABASE_SECRET_KEY` only in Render secrets.
- Use a dedicated, separately rotatable `sb_secret_...` key for Render.
- Never trust a `user_id` from multipart fields, query parameters, filenames, or JSON.
- Validate the user access token before reading or processing the screenshot.
- Verify Finance module access before OCR.
- Keep strict exact-origin CORS.
- Preserve the 4 MB file limit, supported MIME types, magic-byte checks, and decoded-pixel limits.
- Keep OCR concurrency at one until the free instance has been benchmarked.
- Do not log screenshots, tokens, API keys, or full OCR text.
- Do not persist screenshots to Supabase Storage or Render disk in this phase.
- Do not use periodic keep-alive traffic to defeat Render Free idle spin-down.
- Do not expose service-only RPC execution to `PUBLIC`, `anon`, or `authenticated`.

## Source Files

- Render Blueprint: `render.yaml`
- Render service: `services/finance-ocr/`
- Service environment template: `services/finance-ocr/.env.example`
- Service operations guide: `services/finance-ocr/README.md`
- Browser OCR client: `lib/finance/ocrClient.ts`
- Finance upload page: `app/finance/add/page.tsx`
- Supabase preparation migration: `supabase/migrations/20260715091429_render_ocr_intake_leases.sql`
- Architecture PRD: `document/PRD_008.md`

## External References

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render monorepo support](https://render.com/docs/monorepo-support)
- [Render Free services](https://render.com/docs/free)
- [Render Node version configuration](https://render.com/docs/node-version)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JavaScript `auth.getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
