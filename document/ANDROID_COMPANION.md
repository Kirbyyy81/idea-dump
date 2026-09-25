# Android companion integration

PRD: [PRD 013](prd/PRD_013.md). Native build: [android/README.md](../android/README.md).

## Server rollout

Prepare compatible application code and apply the canonical forward migrations before enabling Finance pairing or capture:

- `20260924180817_companion_device_pairing.sql`
- `20260924181429_finance_notification_intake.sql`
- `20260924190019_companion_pairing_approval_limits.sql`

Keep `APP_ORIGIN` set to the public IdeaDump HTTPS origin. The Android build's `companionOrigin` must match it. Existing server-only Supabase credentials are used; no new secret belongs in the APK.

Do not replay the baseline on an existing Supabase project. Preview pending migrations against the intended project before deployment. The changes have been tested on isolated PostgreSQL; they have not been applied to a hosted project by this implementation task.

## Pairing protocol

1. Phone generates a 32-byte verifier and separate 32-byte device token (`idc_` prefix), and stores both encrypted before network access.
2. `POST /api/companion/pair` accepts `verifier_hash` (SHA-256) and a bounded `device_label`. It returns `id`, an eight-character `user_code`, a five-minute `expires_at`, `verification_uri`, and polling `interval`.
3. The signed-in browser opens `/companion/pair?code=...`, displays the phone's code and account, then explicitly approves through `POST /api/companion/pair/approve`.
4. The phone polls `POST /api/companion/pair/complete` with `id`, `verifier`, and `token`. The response is `pending` or `paired` with `device_id` and `user_id`. Retrying the same proof and token returns the same device. Changing the token conflicts.
5. The server stores only hashes. The bearer credential is accepted only by companion source-list, notification, and self-disconnect routes. Each request rechecks revocation and Finance access.
6. The browser lists/revokes owned devices at Finance settings, Companion. A companion may revoke only itself.

Public pairing bootstrap has a database-enforced limit of 100 new requests per minute. Signed-in code lookup and approval share 30 attempts per account per minute; failed lookups consume the allowance. Pairing proofs and credentials never appear in URLs or logs. Lyrics does not require pairing.

## Notification intake

`GET /api/companion/finance-sources` returns active sources owned by the paired user.
`POST /api/companion/notifications` accepts a bounded JSON object:

```json
{
  "client_event_id": "UUID",
  "source_id": "UUID",
  "source_package": "my.com.tngdigital.ewallet",
  "captured_at": "2026-09-25T05:25:00.000Z",
  "notification_key_hash": "64-character SHA-256 digest",
  "notification": {
    "title": "TNG eWallet",
    "text": "Alex has transferred RM 12.30 to you. Tap here to check the transaction details",
    "subtext": null,
    "posted_at": "2026-09-25T05:25:00.000Z"
  }
}
```

Ryt's package is `my.rytbank.app`. UOB (`com.uob.mightymy`) is intentionally disabled pending a real sample. Incoming TNG and outgoing Ryt wording supplied by the owner have parser fixtures.

A successful response returns the durable event status and intake identifier. Identical owner/event replays are safe; a changed payload with the same identifier returns 409. Notification ingestion creates review candidates only. No companion endpoint can confirm a transaction.

Sensitive and unrelated content is discarded before client persistence and checked again on the server. Ignored server events retain a replay digest, without raw text or a candidate. Reviewable text is stored separately from OCR. Confirmation, rejection, and duplicate resolution delete raw title/body/subtext inside the same database transaction. Structured transaction fields and replay digests remain. No notification text enters OCR correction excerpts or lyric requests.

An explicit transaction date wins. Otherwise the candidate suggests the notification's posted date in Asia/Kuala_Lumpur; review displays this provenance. Malformed explicit dates remain unset.

## Local database regression tests

Use only a disposable, fully migrated loopback PostgreSQL database:

```powershell
$env:COMPANION_ALLOW_LOCAL_DB_TESTS = '1'
$env:COMPANION_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55483/companion_full'
# Optional if psql is not on PATH:
$env:PSQL_PATH = 'C:\path\to\psql.exe'
node scripts/test-companion-db.mjs
```

The SQL suites cover pairing replay, wrong proofs, ownership, revocation, intake replay conflicts, manual-review enforcement, all three text-deletion paths, and raw-free ignored events. Fixtures roll back. Hosted databases are rejected by the runner.

## Validation record, 2026-09-25

The debug APK was installed and tested on the user's connected Samsung SM-N986B running Android 13 (API 33). All six instrumentation tests passed in 3.376 seconds:

- Keystore AES-GCM uses fresh nonces and rejects the wrong owner binding.
- The queue survives reopening, deduplicates events, and preserves account ownership.
- The 1,000-event capacity preserves older events.
- Current and next lyrics occupy separate metadata fields; changing tracks restores ordinary metadata.
- Play, pause, next, previous, and seek forward exactly once through the proxy.
- Finance remains opt-in, UOB is disabled, and timing controls persist correctly.

Eight native unit tests passed. Android lint, debug assembly, and test-APK assembly passed. The app's phone layout was inspected; the tab bar clears system navigation. Tests used synthetic events and did not enable bank notification capture. The temporary instrumentation helper was removed; the companion remains installed.

Tested APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 36,912,948 bytes.

SHA-256: `cfcf777e98ee0310631fe79d35d58e083d1d9dbbedac8858582213d3bac1fb7b`.

Both isolated SQL suites passed against the adopted schema plus forward migrations, including all three raw-text deletion paths. Concurrent identical requests produced one event and one candidate. The local PostgreSQL harness stubbed queue/cron/network extension surfaces; hosted workers were not exercised.

Root lint, TypeScript checks, production build, and both dependency audits passed (zero vulnerabilities). Finance OCR typecheck, build, both audits, and 322 tests passed; 131 optional tests were skipped. All 467 root application tests across 80 files passed, including companion HTTP/auth/parser coverage. The suite ran in four groups with one worker; worker-startup timeouts and an execution pause required reruns. No test assertions failed in the completed runs.

## Remaining acceptance and rollout

- Deploy the three migrations and compatible web application before Finance pairing can work against the configured origin.
- Test browser pairing through password and email sign-in, capture real Ryt/TNG notifications, interrupt connectivity, then confirm/reject/mark duplicates through the deployed PWA.
- Verify actual Spotify playback and LRCLIB matching, screen-off behavior, permission revocation, and process recreation on Android 13 and Android 16. Synthetic transport tests do not establish Spotify or head-unit behavior.
- Record the Android Auto version, head unit, and wired/wireless connection; both lyric fields and uninterrupted Spotify audio must pass on that hardware.
- Keep UOB disabled until a sanitized sample has passed parser and device validation.
- Production signing and deployment remain separate from this sideload implementation.

For rollback, pause capture on the phone and revoke affected credentials in Finance settings. Keep additive database tables and lineage intact. Local events stay encrypted until accepted or explicitly discarded.
