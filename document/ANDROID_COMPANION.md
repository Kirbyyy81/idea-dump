# Android companion integration

PRD: [PRD 013](prd/PRD_013.md). Native build: [android/README.md](../android/README.md).

## Server rollout

Prepare compatible application code and apply the canonical forward migrations before enabling Finance pairing or capture:

- `20260924180817_companion_device_pairing.sql`
- `20260924181429_finance_notification_intake.sql`
- `20260924190019_companion_pairing_approval_limits.sql`

Keep `APP_ORIGIN` set to the public IdeaDump HTTPS origin. The Android build's `companionOrigin` must match it. Existing server-only Supabase credentials are used; no new secret belongs in the APK.

Do not replay the baseline on an existing Supabase project. Preview pending migrations against the intended project before deployment. The changes were tested on isolated PostgreSQL and applied to the live IdeaDump project on 2026-09-29. Remote migration history matches the three canonical versions listed above.

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

Ryt's package is `my.rytbank.app`. UOB (`com.uob.mightymy`) is intentionally disabled pending a real sample. Starter patterns are stored centrally in the database and have anonymized regression fixtures:

- TNG: `PERSON has transferred RM X.XX to you. Tap here to check the transaction details` suggests income and the sender.
- TNG: `RM X.XX has been successfully transferred to PERSON.` suggests an expense and the recipient.
- TNG: `RM X.XX received from PERSON for Fund Transfer.` suggests income and the sender, excluding the fixed suffix.
- Ryt: `You've sent RM X.XX to PERSON on DATE, 1:25pm (GMT+8) using your main account` suggests an expense, the recipient, and the explicit date.
- Ryt: `RMX.XX paid at MERCHANT using your Main Account.` suggests an expense and merchant, including the verified card-payment format.
- Ryt: `You've paid RMX.XX to MERCHANT on DATE, 3:51 PM (GMT+8) using your Main Account.` suggests an expense, the merchant, and the explicit date. The `paid` template leaves payee fields empty, even if the merchant name matches a saved payee. The `sent` template continues to represent a transfer to a payee.

Parsing and manual-rule matching use a working copy normalized with Unicode NFKC, collapsed whitespace, and straight apostrophes. Names retain Unicode and internal punctuation such as `A/P` and `@`. Raw text and replay digests remain unchanged. Multiple monetary values leave the amount unset; unsupported wording does not guess a direction.

The server compares extracted counterparties with the paired user's active saved payees using the existing normalized-name convention. Exactly one match sets `payee_id` and the canonical saved name. Missing, archived, or ambiguous saved-payee matches retain the extracted name. Existing manual Finance rules run afterward with their current priority and precedence. Categories still depend on manual rules and user review. Notification extraction learning is separate from screenshot/OCR learning and does not learn categories or notes.

New uploads and Finance Review Retry use the same preparation path: stored extraction patterns, saved-payee matching, manual Finance rules, then duplicate assessment. Manual rules keep precedence. Unknown eligible formats remain reviewable with missing fields. Existing pending candidates are not automatically reparsed. Retry explicitly applies current patterns and saved payees while raw text remains available. Apply the notification-learning migrations below before the compatible web release; no Android reinstall is required.

A successful response returns the durable event status and intake identifier. Identical owner/event replays are safe; a changed payload with the same identifier returns 409. New notification uploads automatically confirm complete, valid transactions after database duplicate checks. Incomplete or conflicting values and possible duplicates remain in Review. The phone sends raw notification data, not a confirmation decision.

Sensitive and unrelated content is discarded before client persistence and checked again on the server. Ignored server events retain a replay digest, without raw text or a candidate. Reviewable text is stored separately from OCR. Confirmation, rejection, and duplicate resolution delete raw title/body/subtext inside the same database transaction. Structured transaction fields and replay digests remain. No notification text enters OCR correction excerpts or lyric requests.

An explicit transaction date wins. Otherwise the candidate suggests the notification's posted date in Asia/Kuala_Lumpur; review displays this provenance. Malformed explicit dates remain unset.

## Automatic notification transactions

A notification is added directly to Transactions when it has a positive valid amount, expense/income direction, a merchant or payee, and a valid date no later than today in Asia/Kuala_Lumpur. The existing Malaysia-local posted-date fallback is valid for this policy. The mapped source must remain active and owned. Category and reference are optional; existing manual rules can still assign a category.

`finance_accept_notification_v2` stores the upload and attempts confirmation in one database transaction. `finance_retry_notification_v1` applies current extraction and the same policy to an explicit Retry. Both use the existing ledger confirmation and duplicate checks under the per-user lock. Possible or strong duplicates require review, including when another upload committed during processing. Conflicting extraction, stale/disabled patterns, missing values, and invalid values cannot auto-confirm. Successful automatic confirmation deletes raw text and records `notification_auto_confirmed` provenance.

Automatic entries do not create notification training evidence. A human must confirm a review item to teach a new pattern. Screenshot automatic-confirmation requirements remain unchanged. Upload replay returns its saved result and does not reparse a pending event. Existing pending notifications remain untouched until Retry; historical deleted text cannot be recovered.

Deploy `20261002104849_finance_notification_auto_confirmation.sql` before the compatible web release. It adds automatic intake/Retry RPCs and updates only the notification branch of the shared automatic-confirmation policy. The previous upload RPC remains compatible with the old web release. No Android reinstall is needed.

### Automatic confirmation validation and rollout, 2026-10-02

Validation passed 590 root tests across 88 files, 16 desktop/mobile browser tests, five isolated companion SQL suites, and concurrent manual/automatic confirmation tests. The final migration also passed from its predecessor state on a disposable database clone. Coverage includes merchant/payee alternatives, optional category/reference, invalid fields and dates, disabled/stale patterns, explicit Retry, raw-text deletion, unexpected-error rollback, ownership, replay, duplicate races, and unchanged screenshot automatic gates. Automatic entries produced no notification learning evidence. Root lint, TypeScript, production build, and both dependency audits passed; a transient npm registry error cleared on retry. OCR typecheck/build/audits passed with 387 tests and 171 optional skips.

The canonical CLI deployed only `20261002104849_finance_notification_auto_confirmation.sql` to IdeaDump. Its deployment set included applied migration history and excluded unrelated pending files. The remotely applied dashboard versions `20260920122733` and `20261002103305`, which are absent on this branch, were represented by their recorded statements without replaying or repairing them. Remote verification confirmed the canonical version, server-only invoker functions with empty search paths, the notification eligibility branch, and unchanged screenshot gates. A rollback-only smoke test checked complete/incomplete eligibility and owner rejection without retained writes. Security and performance advisor findings were unchanged. The optional Docker-dependent local catalog cache was unavailable; the remote deployment succeeded and was verified directly.

The corresponding web code remains committed locally until a requested push and release. Existing pending notifications were not modified. After release, complete new uploads auto-add; pending items can use Retry and add if complete. No Android reinstall is required.

## Notification extraction learning

The engine interprets version 1 pattern definitions with escaped literal anchors and bounded typed slots for amount, date, time, counterparty, and reference. Rules contain no executable code or user-supplied regular expressions. Starter definitions also contain conservative amount/date fallbacks. Runtime parsing contains no bank-specific extraction branches.

One successful manual confirmation can activate a personalized pattern immediately. The server compares the original notification with the reviewed values, replacing uniquely identifiable values with selectors so a later message can contain a different amount, name, date, and reference. Direction can be a fixed classification for that format. Ambiguous or unsupported corrections remain manual; a confirmed value is never reused as a constant selector. Unknown formats require a uniquely identifiable counterparty and refuse unclassified numeric anchors. This does not infer every possible format from one example.

Patterns are scoped to user, Finance source, bank package, and format. A personalized format overrides its starter; disagreeing matching patterns leave the affected field unset. Disabling a pattern creates or updates the user's override, suppresses that starter, and survives subsequent reviews. Disabling one format does not disable separately listed generic amount/date patterns. Finance settings, Rules, Notification patterns lets the owner inspect structural slots and enable or disable patterns for a selected source. Review shows learned fields and unresolved pattern conflicts. Manual rule results are not labeled as learned extraction.

The server-only `finance_confirm_notification_v1` wraps existing confirmation. It captures raw-text context before deletion and commits the transaction, pattern, and review provenance atomically. Replays, unsuccessful confirmations, rejection, and duplicate linking do not train. A changed review source is recorded without learning into the original source. Confirmation remains successful when a correction cannot be inferred safely.

`finance_notification_patterns` stores shared starters and owner-specific definitions, revisions, activation state, and the latest supporting transaction. `finance_notification_learning_reviews` records successful confirmation identifiers and the learning outcome. Neither stores complete notification text or copies it into OCR evidence. Changes to the supporting transaction's extraction fields invalidate its pattern; category/notes-only edits do not. Deletion also invalidates the pattern. A fresh confirmed notification can provide new support, but does not re-enable a disabled pattern. Deleted raw text is never reconstructed for learning or historical backfill.

Deploy these canonical migrations before the compatible web release:

- `20261002100322_finance_notification_patterns.sql`
- `20261002101103_finance_notification_learning.sql`

Use a reviewed deployment set that excludes unrelated pending migrations. Both migrations are additive. Android upload contracts, screenshot learning, and category assignment stay compatible. After releasing the web code, Retry will populate the pending Ryt card payment from the stored starter format. No Android reinstall is needed.

### Notification learning validation and rollout, 2026-10-02

The full root suite passed 584 tests across 87 files. The final package-isolation safeguard and API passed 13 focused tests. Review/settings and duplicate-link browser tests passed on desktop and mobile (12 tests); the six notification UI tests passed again after the loading safeguard. The four isolated companion SQL suites and separate-connection lock/concurrent-confirmation tests passed. Root lint, TypeScript, production build, and full/production dependency audits passed with zero vulnerabilities. OCR typecheck, build, both audits, and 387 tests passed (171 optional tests skipped).

The canonical CLI push applied only `20261002100322` and `20261002101103` to the live IdeaDump project. The temporary deployment set included already-applied history and excluded unrelated parser migrations `20260918033827` and `20260929055515`; no migration history was repaired. Staged migration checksums matched the committed files. The post-deployment dry run reported no pending migrations in that set. The CLI could not update its optional local catalog cache because Docker was unavailable; remote versions and objects were verified directly.

Catalog checks verified 15 valid starter definitions, RLS on both tables, no direct browser-role table access, and security-invoker functions with empty search paths and server-only execution. A rollback-only service-role smoke test verified owner/source rejection without retaining writes. Security advisors added only expected [RLS-without-policies information](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for the two server-only tables; existing warnings were unchanged. Performance advisors added [unused-index information](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) for the newly created indexes and no new missing-FK-index findings.

The compatible web release is still required. The branch is committed locally and has not been pushed as part of this change. Existing pending notifications were not reparsed or modified; use Retry after the web release. Historical resolved notifications whose raw text was deleted cannot be backfilled.

## Linking screenshot details to a notification transaction

A notification and a screenshot still enter Finance independently. Duplicate checks compare each review item with confirmed transactions. If both items are pending, confirm one, then Retry the other to refresh its match.

In the duplicate comparison, choose the incoming details to keep. Empty saved fields are selected by default. Conflicting values remain unselected until the user chooses them. `Link selected details` updates the existing transaction and resolves the incoming candidate as its duplicate in one database transaction. `Link without changes` retains the evidence relationship without editing the ledger. No second ledger row is created.

The comparison supports reference number, merchant, payee, notes, amount, date, direction, source, and category. Blank incoming values never clear saved values. Changing an incoming conflict after selecting it requires selecting the revised value again. Saved fields changed by another operation cause a conflict and a fresh review instead of an overwrite.

The original transaction origin and intake remain intact. The duplicate candidate identifies the existing transaction; a `duplicate_linked` processing event records the supplying intake and the before/after values of each applied field. Original OCR evidence remains on the screenshot intake. This is a link to extracted information, not permanent image storage: existing transient image cleanup still applies. Linking does not create OCR correction-learning evidence. Notification raw text is still deleted when the incoming notification is resolved.

Deploy `20261001103729_finance_link_duplicate_details.sql` before the corresponding web release. The migration adds a server-only, security-invoker function and does not alter historical transactions. No Android APK or OCR service change is required. Existing resolved duplicates are not retroactively enriched.

Validation on 2026-10-01 passed 565 Web tests across 84 files, 387 OCR tests (171 optional tests skipped), 12 desktop/mobile browser tests, and the three isolated companion SQL suites. A two-connection test verified that a held candidate lock produces a safe retry and the subsequent link leaves one ledger row. Web lint, TypeScript, production build, OCR typecheck/build, and full/production dependency audits passed with zero vulnerabilities. Desktop and 330px phone layouts were inspected. Hosted rollout completed on 2026-10-01.

The live IdeaDump project records the canonical version `20261001103729`. Catalog verification confirmed that `finance_link_candidate_v1` matches the committed function, uses security-invoker execution with an empty search path, permits `service_role`, and denies `PUBLIC`, `anon`, and `authenticated`. A rollback-only service-role smoke test confirmed invalid-input rejection without changing user data. The security advisor reported no new findings.

The branch-wide CLI dry run encountered an existing ledger discrepancy: deployed dashboard migration `20260920122733` is absent locally, while parser migrations `20260918033827` and `20260929055515` remain undeployed. A temporary deployment directory contained the applied migrations (reconstructing the missing dashboard file from stored migration statements) and the exact committed linking migration. Its dry run listed only `20261001103729_finance_link_duplicate_details.sql`; the canonical CLI push applied it, and a second dry run reported no pending migrations in that deployment set. The unrelated parser migrations and existing production history were left unchanged. The corresponding web release is still required; this rollout did not deploy application code.

## Local database regression tests

Use only a disposable, fully migrated loopback PostgreSQL database:

```powershell
$env:COMPANION_ALLOW_LOCAL_DB_TESTS = '1'
$env:COMPANION_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55483/companion_full'
# Optional if psql is not on PATH:
$env:PSQL_PATH = 'C:\path\to\psql.exe'
node scripts/test-companion-db.mjs
```

The SQL suites cover pairing replay, wrong proofs, ownership, revocation, intake replay conflicts, manual-review enforcement, all three text-deletion paths, and raw-free ignored events. The linking suite also verifies selected fields, explicit conflicts, ownership, stale previews, replay safety, provenance, and rollback. The learning suite verifies ownership/source isolation, one-review activation, correction, disabling, replay, invalidation, permissions, and atomic raw-text deletion. SQL fixtures roll back. The runner also opens separate connections to test held candidate locks and simultaneous confirmations; these committed synthetic fixtures use a fresh test owner and are deleted afterward. Hosted databases are rejected by the runner.

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

## Hosted rollout verification, 2026-09-29

All three companion migrations were applied to the live IdeaDump Supabase project. The deployed pairing endpoint had returned HTTP 503 because the companion schema was missing. After deployment, pairing creation and proof-based polling both returned HTTP 200. The unapproved diagnostic request correctly remained pending and was removed after verification. The verification URL points to `https://idea-dump-alpha.vercel.app`.

The four new tables have RLS enabled and deny direct access to `anon` and `authenticated`; the companion functions are security invoker and executable only by the server role. The security advisor reports informational [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) findings for these intentionally server-only tables. Existing warnings for [pg_net in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) are unchanged.

This verifies pairing bootstrap and polling, not the user's browser approval or real notification capture. No user account was approved by the diagnostic.

## Android Auto loading regression, 2026-09-30

A platform media-browser connection to the original APK timed out on the connected Samsung SM-N986B. `LyricsMediaService.onGetSession` rejected Media3's unidentified legacy-controller placeholder before the framework could finish binding. Media3 documents this [legacy binding special case](https://developer.android.com/reference/androidx/media3/session/MediaSessionService#onGetSession(androidx.media3.session.MediaSession.ControllerInfo)). Authorization now runs in `MediaLibrarySession.Callback.onConnect`, where the actual client identity is available, retaining the trusted-client, own-package, and Android Auto checks.

A second failing regression showed that a Media3 subscription succeeded without announcing available content. The service now resolves the browsable root through `onGetItem`, uses the default subscription callback, and notifies subscribers when displayed metadata changes.

Both new browser tests failed against the original installed APK and passed after updating it. The two existing media-proxy tests also passed, for four device tests total. Eight unit tests, Android lint, and debug/test APK assembly passed. The fixed APK was installed on the connected SM-N986B; the temporary test helper was removed. The phone used for the reported car test was a different device, so these results do not replace a retest with that phone and head unit.

## Notification normalization validation, 2026-10-01

Supported TNG transfers, Ryt transfers and merchant payments, Unicode/whitespace/apostrophe normalization, conservative amounts and dates, unique saved-payee matching, ownership/archive filtering, manual-rule precedence, and identical intake/Retry preparation passed 87 focused tests. Merchant payments retain empty payee fields even when a saved payee has the same name. Amount checks accept sentence punctuation while rejecting malformed decimals and ambiguous monetary values. Synthetic fixtures verify that raw text and replay identity remain unchanged.

All 547 root tests across 83 files passed with Node 22.22.0 using `npm test -- --maxWorkers=1 --pool=threads`. The default process-worker run stalled on Windows and was stopped before this completed thread-worker run. Root lint, TypeScript, service-worker checks, and the production build passed.

The normalization work initially left existing `brace-expansion` and `dompurify` audit findings unresolved. Subsequent dependency updates on 2026-10-01 patched both packages, along with Fastify and fast-uri in the Finance OCR service. Full and production-only audits now report zero vulnerabilities in both projects.

These are server changes for new intake and explicit Retry. Existing pending records were not reparsed, and no hosted data, schema, or Android build was changed.

## Remaining acceptance and rollout

- Test browser pairing through password and email sign-in, capture real Ryt/TNG notifications, interrupt connectivity, then confirm/reject/mark duplicates through the deployed PWA.
- Verify actual Spotify playback and LRCLIB matching, screen-off behavior, permission revocation, and process recreation on Android 13 and Android 16. Synthetic transport tests do not establish Spotify or head-unit behavior.
- Record the Android Auto version, head unit, and wired/wireless connection; both lyric fields and uninterrupted Spotify audio must pass on that hardware.
- Keep UOB disabled until a sanitized sample has passed parser and device validation.
- Production APK signing and distribution remain separate from this sideload implementation.

For rollback, pause capture on the phone and revoke affected credentials in Finance settings. Keep additive database tables and lineage intact. Local events stay encrypted until accepted or explicitly discarded.
