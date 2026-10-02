# Log Viewer

The `/log-viewer` tool parses pasted or uploaded logs in the browser. Log contents and dictionaries are not uploaded or stored on a server.

The floating **Back to log input** button in the bottom-right corner immediately returns to the top, opens **Import Logs**, and focuses the paste field. Existing input, filters, and parsed results are preserved.

## Payload display

Open a request, response, or content-data panel to read indented, syntax-coloured JSON. Objects and arrays start expanded and can be folded individually using their arrow buttons, or together using **Expand all** and **Collapse all**. Folded values retain their braces or brackets and show an ellipsis. All controls support the keyboard. Long lines scroll within the panel.

The header's copy icon copies the complete payload with two-space indentation, including values hidden by folding, even when the panel is closed. It has an accessible Copy JSON label and shows a checkmark after copying. Clipboard success or failure is announced without changing the panel, raw visibility, or folding. Copy is available only for valid JSON, including primitive values.

The header's raw-line button reveals the original record below the formatted payload, and hides it when pressed again. It also opens a closed panel. Raw, copy, and folding controls are independent between records. Closing a payload unmounts its formatted content; reopening it starts expanded again.

Text and empty bodies remain readable. Malformed JSON displays the extracted text with a warning, without repairing or replacing values. The original record, including multiline content and its line references, remains available through the raw control.

## Source detection

- Yes Shop: URL paths beginning with `/yesshop/`, `/yesshop-admin/`, `/yesshop-report/`, `/yesshop-wallet/`, or `/cots/api/yes-shop/`.
- USSP: URL paths beginning with `/ussp/`.
- Shared authentication, eKYC, and content records inherit the single detected source. Filenames and hostnames do not determine the source.
- In mixed input, records without a source-specific URL inherit a source only when surrounding URL anchors agree. Source transitions form separate correlation segments. Unknown records retain generic parsing.

Source adapters live under `lib/log-viewer/sources/`. Shared record types are declared in `lib/types.ts`; the previous `lib/log-viewer/types.ts` import path remains a compatibility export.

## Pairing and dictionaries

Duplicate logging is preserved: requests and content records are not deduplicated, specially labelled, or cross-linked. Existing correlation and concurrency rules still apply to each original event.

Requests and responses match by shared IDs first. A response ID can also identify its content record and a single compatible pending request, preventing a missing response from shifting later USSP polling pairs. Otherwise, requests queue by source segment, host, and endpoint. Concurrent endpoint-only matches have low confidence.

Yes Shop also records bare endpoint names. These retain their original names and do not receive invented URLs. A bare name can share the identity of a full URL only when there is exactly one observed host/path for that name in the segment. Endpointless eKYC image results can match one outstanding compatible image-upload request, with low confidence.

After request/response pairing, content records attach using evidence from both sides:

1. A unique shared request, response, or client request ID.
2. A source-specific dictionary or payload signature within ten parsed events.
3. For unnamed USSP content only, a unique nearby compatible transaction, with low confidence. Session-only polling requests are excluded.

Later content for the same endpoint begins a new dictionary matching window. Ambiguous IDs, competing candidates, and known dictionary mismatches are not resolved by proximity. Unmatched records remain accessible in the standalone section. Content matching has its own confidence, separate from request/response pairing.

The named Yes Shop aliases and USSP payload signatures live in `lib/log-viewer/dictionary.ts`. Extend these with sample-backed rules and regression fixtures. Normalise names for lookup while preserving original spelling for display. Do not add broad substring or nearest-line rules that override known mappings.

Additional Yes Shop aliases cover daily/monthly sales totals, wallet payment types and top-ups, CVP history and transfer details, and dealer store lists. A `responseStatus` object with `status: SUCCESSFUL` and `errorCode: "00"` treats its `errorMessage` as informational. HTTP errors, error markers, explicit failure codes, and other failure evidence still take precedence.

Content can attach to a response even when its request was not logged. The transaction shows `Request not logged`, retains its orphan status, and remains searchable by content and response text. It never fabricates a request.

USSP transport errors can contain `Response{protocol=..., code=...}` before a multiline JSON payload. The adapter extracts the HTTP status and parses the actual payload following the envelope. Invalid content containing unescaped nested JSON strings remains text.

## Table dumps

Consecutive `=== Table: <name> ... Row: ...` and `Table <name> is empty` records appear as one **Table dump** timeline row. A non-table event, source-segment change, repeated table name, backwards timestamp, or gap exceeding one second starts a new batch. Records without comparable timestamps remain separate. Grouping runs after API correlation and keeps the original event count and matching distances intact; each batch counts as one displayed transaction row.

Expand a batch to see each table as **Field / Value** rows, including empty tables and multiple database rows. Field order and string values are preserved, including blanks, leading zeros, and literal `null`. Quoted or nested values keep their internal delimiters. Malformed records remain readable as original text rather than being repaired. **Raw table dump** independently reveals the complete original records, timestamps, and line references.

Table names, fields, and values are searchable, and batches remain available through the **Info** filter. The sanitized `yes-shop-tables.txt` fixture preserves the four eight-table batches observed in the updated sample, including its reordered second batch, with synthetic field values.

## Validation

Use Node 22.22.0. Sanitised fixtures in `lib/log-viewer/fixtures/` preserve representative ordering and correlation relationships without including the original private samples.

```powershell
npm run test:log-viewer
npx playwright test tests/browser/log-viewer.spec.ts
```

The first command runs parser, dictionary, correlation, table-batch, and component tests. The browser suite checks desktop and mobile uploads, deep JSON rendering, keyboard-operated folding, copying complete JSON from folded or closed panels, independent raw controls, table-batch rendering/search/filtering, missing requests, and the explicit parse action for large pastes. Browser harnesses live under `tests/browser/` and do not ship in application routes.

Also run the audits, lint, TypeScript, full tests, and production build required by the repository guide.
