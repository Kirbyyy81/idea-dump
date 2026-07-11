# Finance Fix 002: OCR Data Contract

## Summary

This fix makes OCR output durable, explainable, and useful for later duplicate detection. It separates raw text from normalized text, retains Tesseract confidence, adds a normalized-text hash, stores currency and reference numbers explicitly, and gives the parser a stable typed input/output contract.

The original screenshot remains temporary and must still be discarded after processing.

- **Priority:** High
- **Recommended delivery:** After Fix 001
- **Depends on:** Stable intake/confirmation state transitions from Fix 001
- **Enables:** Text-based duplicate detection, better review explanations, parser regression testing, and future multi-currency support

## Problems Being Fixed

### 1. Raw and cleaned OCR are not separated

The PRD requires both raw and cleaned OCR text. The current intake table has only `ocr_text`, and `lib/finance/parser.ts` performs light trimming/lowercasing internally. This makes it impossible to distinguish what Tesseract actually returned from what the application changed before parsing.

### 2. Tesseract confidence is discarded

`lib/finance/ocr.ts` returns only `result.data.text.trim()`. Tesseract's confidence is not retained, so review and debugging cannot distinguish poor OCR from weak parsing.

### 3. OCR text cannot be used for exact duplicate detection

The system hashes the image bytes but does not hash normalized OCR text. Visually different screenshots containing the same receipt may bypass exact image hashing.

### 4. Currency is implicit

The application formats values as MYR, and the parser recognizes `RM` and `MYR`, but neither candidate nor transaction records store a currency code. This creates ambiguous data and makes future migration harder.

### 5. Reference numbers are buried in candidate payload or notes

The parser extracts a reference, but confirmed transactions store it by embedding text into `notes`. Duplicate checks and reporting cannot reliably query it.

## Desired Outcome

After this fix:

- every processed intake can retain raw OCR, normalized OCR, OCR confidence, and normalized-text hash
- the parser receives normalized text through a clear API rather than normalizing implicitly
- candidate and transaction records carry an explicit ISO-style currency code
- confirmed transactions have a queryable reference number
- existing records are backfilled safely without pretending historical text was normalized by the new algorithm
- processing events explain OCR and normalization outcomes
- original image bytes are still never persisted by default

## Scope

### Included

- additive intake and transaction schema changes
- a typed OCR result
- a pure normalization function
- normalized-text hashing
- MYR-default currency storage
- explicit transaction reference numbers
- parser/type/API/UI updates necessary to preserve these fields
- data backfill and dual-write rollout
- unit and integration tests

### Not included

- OCR provider replacement
- image retention or thumbnail storage
- asynchronous OCR jobs
- full multi-currency conversion or exchange rates
- several candidates per screenshot
- fuzzy duplicate decision logic

## Proposed Data Contract

### Intake fields

Add to `finance_intake_items`:

| Field | Suggested type | Purpose |
|---|---|---|
| `ocr_raw_text` | `text` | Exact text returned by Tesseract, excluding only unavoidable transport conversion. |
| `ocr_normalized_text` | `text` | Safely normalized text consumed by the parser and rules. |
| `ocr_confidence` | `numeric(5,2)` | Tesseract confidence on a documented 0-100 scale. |
| `ocr_text_hash` | `text` | SHA-256 of the normalized text using a versioned canonical encoding. |
| `normalizer_version` | `integer` | Identifies which normalization rules produced the normalized text/hash. |

Keep the existing `ocr_text` during rollout. Treat it as a compatibility field until all reads and writes have moved to the new contract. Do not drop it in the same release.

### Candidate payload fields

Extend `FinanceCandidatePayload` with:

- `currency: string | null`
- `reference_number: string | null`
- optional `ocr_confidence: number | null` only if review needs a snapshot independent of the intake
- optional parser explanation fields if the review UI needs them later

Rename the existing payload key `reference` to `reference_number` through a compatibility read. Existing JSON payloads will still contain `reference`, so the application must read both until data is migrated.

### Transaction fields

Add to `finance_transactions`:

| Field | Suggested type | Default | Purpose |
|---|---|---|---|
| `currency` | `text` or `char(3)` | `MYR` | Explicit transaction currency. |
| `reference_number` | `text` | `null` | Queryable receipt/bank reference. |

Use an uppercase three-character validation rule. Keep the v1 UI fixed to MYR, but store the value per transaction.

## Likely Files to Change

- `lib/finance/ocr.ts`
- a new `lib/finance/normalizer.ts`
- `lib/finance/parser.ts`
- `lib/finance/api.ts`
- `lib/types.ts`
- `app/api/finance/upload/route.ts`
- `app/api/finance/review/route.ts`
- `app/api/finance/transactions/route.ts`
- `app/finance/review/page.tsx`
- `app/finance/transactions/page.tsx`
- `app/finance/add/page.tsx`
- `lib/utils.ts` if currency formatting is generalized
- a new forward migration under `document/migrations/`
- parser, OCR, API, migration, and browser tests

## Detailed Implementation Plan

### Step 1: Define scales and naming before changing code

Document these invariants:

- Tesseract OCR confidence uses `0` through `100`.
- Parser confidence continues using `0` through `1`.
- The two values must never share an ambiguous field named only `confidence`.
- Raw OCR is preserved before normalization.
- Normalized text is deterministic for a given `normalizer_version`.
- `ocr_text_hash` is SHA-256 over UTF-8 normalized text.
- Currency codes are stored uppercase and default to `MYR`.

### Step 2: Add the schema fields additively

Create a forward migration that:

1. adds nullable OCR fields to `finance_intake_items`
2. adds nullable `currency` and `reference_number` to `finance_transactions`
3. backfills transaction currency to `MYR`
4. makes `currency` non-null with a default after backfill
5. adds a validation constraint for a three-letter uppercase code
6. adds an index for user/reference lookups where the reference is not null
7. adds an index for user/text-hash duplicate lookups where the hash is not null

Rough SQL shape:

```sql
alter table public.finance_intake_items
  add column if not exists ocr_raw_text text,
  add column if not exists ocr_normalized_text text,
  add column if not exists ocr_confidence numeric(5, 2),
  add column if not exists ocr_text_hash text,
  add column if not exists normalizer_version integer;

alter table public.finance_transactions
  add column if not exists currency text,
  add column if not exists reference_number text;

update public.finance_transactions
set currency = 'MYR'
where currency is null;

alter table public.finance_transactions
  alter column currency set default 'MYR',
  alter column currency set not null;
```

Add check constraints only after validating current rows.

### Step 3: Change the OCR adapter to return structured data

Change `recognizeFinanceScreenshot` from returning a string to returning a typed object such as:

```ts
interface FinanceOcrResult {
    rawText: string;
    confidence: number | null;
}
```

Use Tesseract's returned text and confidence. Do not trim or lowercase inside the adapter beyond handling a truly empty result. Provider-specific behavior should end at this boundary.

Rough approach:

```ts
const result = await worker.recognize(image);
return {
    rawText: result.data.text,
    confidence: Number.isFinite(result.data.confidence)
        ? result.data.confidence
        : null,
};
```

Keep worker termination in `finally`.

### Step 4: Add a pure, versioned normalizer

Create `lib/finance/normalizer.ts` with a function that has no database or network dependencies:

```ts
interface NormalizedFinanceText {
    text: string;
    version: number;
}

function normalizeFinanceOcrText(rawText: string): NormalizedFinanceText
```

Safe v1 normalization may include:

- normalize CRLF/CR to LF
- normalize Unicode compatibility forms where safe
- trim trailing whitespace on each line
- collapse repeated spaces within a line
- remove empty leading/trailing lines
- standardize known MYR labels such as `MYR` and `RM` without changing numeric value
- normalize non-breaking spaces

Avoid aggressive substitutions such as blindly converting every `I` to `1`. Context-sensitive OCR corrections should be separately tested and applied only where confidence is high.

The normalizer should not lowercase the durable normalized text unless that is explicitly chosen. Matching code can create a lowercase comparison view while preserving readable normalized output.

### Step 5: Add a deterministic hash helper

Compute SHA-256 from the exact normalized UTF-8 text and store it as lowercase hexadecimal.

The hash must be calculated after normalization and associated with `normalizer_version`. If normalization rules change later, historical hashes should not be silently recomputed without a planned migration.

Possible helper:

```ts
function hashNormalizedFinanceText(text: string) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
```

### Step 6: Make the parser consume normalized text

Change `parseFinanceText` so its input is clearly named `normalizedText`. Remove normalization responsibilities that now belong to the new normalizer.

The parser may still create local comparison forms, for example `normalizedText.toLowerCase()`, but it should not mutate the durable input.

Update parser output to include:

- `currency`, defaulting to `MYR` when an RM/MYR amount is detected or when v1 defaults apply
- `reference_number`
- the existing amount, merchant, direction, date, source, category, matched rules, and duplicate pointer

Do not increase parser confidence merely because the application defaulted currency to MYR. Defaults are not evidence extracted from the screenshot.

### Step 7: Update the upload flow to dual-write

During the compatibility period, `app/api/finance/upload/route.ts` should:

1. receive the image in memory
2. hash the image as it does today
3. call the structured OCR adapter
4. reject an empty raw text result with a clear processing error
5. normalize raw text
6. compute the normalized-text hash
7. store new raw/normalized/confidence/hash/version fields
8. also write the existing `ocr_text` field, preferably with normalized text, while old readers remain
9. parse the normalized text
10. store currency/reference in the candidate payload
11. pass currency/reference to the transactional confirmation path from Fix 001

Add processing events for:

- `ocr_started`
- `ocr_completed`, including confidence and character count
- `normalization_completed`, including version and normalized character count
- `parsing_completed`, including which fields were found but not sensitive raw contents
- failure stage and safe error message

### Step 8: Update review and ledger APIs

Review should display the normalized OCR by default and allow the raw OCR to be expanded for debugging. Clearly label them.

Review confirmation and manual transaction APIs should:

- accept/store currency, but force `MYR` in v1 unless multi-currency is explicitly enabled
- accept/store an optional reference number
- stop embedding references into notes as the primary storage mechanism
- continue reading legacy `payload.reference` and reference text in notes when rendering older records

The transaction response type should expose `currency` and `reference_number`.

### Step 9: Generalize currency formatting without exposing unsupported UI

Replace assumptions that every value can only use `formatCurrencyMYR` with a helper accepting a currency code:

```ts
formatCurrency(amount, currency = 'MYR')
```

The v1 forms do not need a currency selector. They should submit `MYR` explicitly or let the trusted server default it.

### Step 10: Backfill existing intake data carefully

Historical `ocr_text` cannot be separated into genuine raw and normalized values because the original distinction was never stored.

Recommended backfill:

- copy existing `ocr_text` to `ocr_raw_text`
- copy the same value to `ocr_normalized_text`
- set `normalizer_version` to `0` to mean legacy/unknown normalization
- compute a hash over the copied normalized text
- leave `ocr_confidence` null

Do not label historical text as version 1 unless it has actually been processed by version 1 rules.

For large datasets, backfill in batches outside the schema-locking part of the migration.

### Step 11: Switch reads, then retire compatibility fields later

Use a staged transition:

1. schema supports old and new fields
2. application dual-writes
3. backfill completes and is validated
4. review/parser reads the new fields with legacy fallback
5. metrics confirm no new nulls
6. stop relying on `ocr_text`
7. remove `ocr_text` only in a later migration after at least one stable release

## Validation and Monitoring

Track:

- percentage of processed screenshot intakes with all four new OCR fields
- average and distribution of OCR confidence
- number of normalization failures
- text-hash collision/duplicate rate
- candidate parse success by OCR confidence band
- number of legacy version `0` rows remaining

Never log full OCR text to application logs. Use intake IDs, lengths, confidence, versions, and hashes.

## Testing Plan

### OCR adapter tests

- text and confidence are returned separately
- empty OCR is handled explicitly
- worker termination occurs on success and error
- confidence scale remains 0-100

### Normalizer unit tests

- line endings, repeated spaces, and non-breaking spaces normalize deterministically
- raw input is not mutated
- the same input/version always produces the same output/hash
- numeric values are not changed by unsafe substitutions
- Unicode merchant names remain readable
- empty/whitespace-only input behaves predictably

### Parser unit tests

- parser consumes normalized text
- MYR/RM amounts produce `currency = 'MYR'`
- reference numbers populate `reference_number`
- parser confidence is independent from Tesseract confidence
- legacy payload reference fallback remains readable

### Migration tests

- old rows receive currency `MYR`
- legacy OCR backfill uses normalizer version `0`
- OCR confidence remains null for historical records
- reference and hash indexes are created successfully
- rollback does not discard the original `ocr_text`

### API/browser tests

- a new screenshot stores raw and normalized text separately
- OCR confidence and text hash are persisted
- no image bytes or storage URL are persisted
- review can show normalized and raw OCR
- confirmed transaction stores currency/reference explicitly
- older candidates and transactions still render

## Acceptance Criteria

- [ ] OCR adapter returns raw text and Tesseract confidence as distinct typed fields.
- [ ] A pure versioned normalizer produces deterministic normalized text.
- [ ] New intakes store raw text, normalized text, OCR confidence, text hash, and normalizer version.
- [ ] Existing intake rows are backfilled without claiming unavailable historical confidence.
- [ ] Parser input is normalized text and parser confidence remains on a documented 0-1 scale.
- [ ] Candidate payload exposes currency and reference number.
- [ ] Confirmed transactions store `currency = 'MYR'` and an optional reference number.
- [ ] Review and ledger APIs preserve and return the new fields.
- [ ] Original screenshots remain unretained.
- [ ] Compatibility reads support existing `ocr_text` and `payload.reference` records during rollout.
- [ ] Automated tests cover adapter, normalization, hashing, parsing, migration, and browser behavior.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Aggressive normalization changes transaction values. | Keep normalization conservative and cover every transformation with fixtures. |
| OCR and parser confidence are confused. | Use explicit names and different documented scales. |
| Adding non-null currency breaks old rows. | Add nullable, backfill MYR, validate, then set default/non-null. |
| New normalizer changes hashes after deployment. | Store `normalizer_version` and never silently rewrite hashes. |
| Historical `ocr_text` is misrepresented as raw. | Mark backfilled rows as legacy version `0` and confidence null. |
| OCR text leaks through logs. | Log only IDs, hashes, lengths, versions, and confidence. |

## Rollback

The migration is intentionally additive. If application rollout fails:

1. return reads to `ocr_text`
2. keep the new nullable OCR fields and transaction currency/reference columns
3. stop dual-writing only after confirming no new code depends on the fields
4. do not delete backfilled data in a rollback
5. correct normalization through a new version rather than rewriting version 1 output in place
