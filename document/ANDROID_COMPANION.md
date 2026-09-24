# Android companion integration

PRD: [PRD 013](prd/PRD_013.md). Native build: [android/README.md](../android/README.md).

## Server rollout

Apply the canonical forward migrations after deploying compatible application code:
- `20260924180817_companion_device_pairing.sql`
- `20260924181429_finance_notification_intake.sql`

Keep `APP_ORIGIN` set to the public IdeaDump HTTPS origin. The Android build's `companionOrigin` must match it. Existing server-only Supabase credentials are used; no new secret belongs in the APK.

Do not replay the baseline on an existing Supabase project. Preview pending migrations against the intended project before deployment. The changes have been tested on isolated PostgreSQL; they have not been applied to a hosted project by this implementation task.

## Pairing protocol

1. Phone generates a 32-byte verifier and separate 32-byte device token (`idc_` prefix), and stores both encrypted before network access.
2. `POST /api/companion/pair` accepts `verifier_hash` (SHA-256) and a bounded `device_label`. It returns `id`, an eight-character `user_code`, a five-minute `expires_at`, `verification_uri`, and polling `interval`.
3. The signed-in browser opens `/companion/pair?code=...`, displays the phone's code and account, then explicitly approves through `POST /api/companion/pair/approve`.
4. The phone polls `POST /api/companion/pair/complete` with `id`, `verifier`, and `token`. The response is `pending` or `paired` with `device_id` and `user_id`. Retrying the same proof and token returns the same device. Changing the token conflicts.
5. The server stores only hashes. The bearer credential is accepted only by companion source-list, notification, and self-disconnect routes. Each request rechecks revocation and Finance access.
6. The browser lists/revokes owned devices at Finance settings, Companion. A companion may revoke only itself.

Public pairing bootstrap has a database-enforced limit of 100 new requests per minute. Pairing proofs and credentials never appear in URLs or logs. Lyrics does not require pairing.

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
