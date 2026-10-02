# Log Viewer

The `/log-viewer` tool parses pasted or uploaded logs in the browser. Log contents and dictionaries are not uploaded or stored on a server.

## Payload display

Open a request, response, or content-data panel to read indented, syntax-coloured JSON. Objects and arrays start expanded and can be folded individually using their arrow buttons, or together using **Expand all** and **Collapse all**. Folded values retain their braces or brackets and show an ellipsis. All controls support the keyboard. Long lines scroll within the panel.

The header's copy icon copies the complete payload with two-space indentation, including values hidden by folding, even when the panel is closed. It has an accessible Copy JSON label and shows a checkmark after copying. Clipboard success or failure is announced without changing the panel, raw visibility, or folding. Copy is available only for valid JSON, including primitive values.

The header's raw-line button reveals the original record below the formatted payload, and hides it when pressed again. It also opens a closed panel. Raw, copy, and folding controls are independent between records. Closing a payload unmounts its formatted content; reopening it starts expanded again.

Text and empty bodies remain readable. Malformed JSON displays the extracted text with a warning, without repairing or replacing values. The original record, including multiline content and its line references, remains available through the raw control.

## Source detection

- Yes Shop: URL paths beginning with `/yesshop/`, `/yesshop-admin/`, `/yesshop-report/`, or `/cots/api/yes-shop/`.
- USSP: URL paths beginning with `/ussp/`.
- Shared authentication, eKYC, and content records inherit the single detected source. Filenames and hostnames do not determine the source.
- In mixed input, records without a source-specific URL inherit a source only when surrounding URL anchors agree. Source transitions form separate correlation segments. Unknown records retain generic parsing.

Source adapters live under `lib/log-viewer/sources/`. Shared record types are declared in `lib/types.ts`; the previous `lib/log-viewer/types.ts` import path remains a compatibility export.

## Pairing and dictionaries

Requests and responses match by shared IDs first. A response ID can also identify its content record and a single compatible pending request, preventing a missing response from shifting later USSP polling pairs. Otherwise, requests queue by source segment, host, and endpoint. Concurrent endpoint-only matches have low confidence.

Yes Shop also records bare endpoint names. These retain their original names and do not receive invented URLs. A bare name can share the identity of a full URL only when there is exactly one observed host/path for that name in the segment. Endpointless eKYC image results can match one outstanding compatible image-upload request, with low confidence.

After request/response pairing, content records attach using evidence from both sides:

1. A unique shared request, response, or client request ID.
2. A source-specific dictionary or payload signature within ten parsed events.
3. For unnamed USSP content only, a unique nearby compatible transaction, with low confidence. Session-only polling requests are excluded.

Later content for the same endpoint begins a new dictionary matching window. Ambiguous IDs, competing candidates, and known dictionary mismatches are not resolved by proximity. Unmatched records remain accessible in the standalone section. Content matching has its own confidence, separate from request/response pairing.

The named Yes Shop aliases and USSP payload signatures live in `lib/log-viewer/dictionary.ts`. Extend these with sample-backed rules and regression fixtures. Normalise names for lookup while preserving original spelling for display. Do not add broad substring or nearest-line rules that override known mappings.

Content can attach to a response even when its request was not logged. The transaction shows `Request not logged`, retains its orphan status, and remains searchable by content and response text. It never fabricates a request.

USSP transport errors can contain `Response{protocol=..., code=...}` before a multiline JSON payload. The adapter extracts the HTTP status and parses the actual payload following the envelope. Invalid content containing unescaped nested JSON strings remains text.

## Validation

Use Node 22.22.0. Sanitised fixtures in `lib/log-viewer/fixtures/` preserve representative ordering and correlation relationships without including the original private samples.

```powershell
npm run test:log-viewer
npx playwright test tests/browser/log-viewer.spec.ts
```

The first command runs parser, dictionary, correlation, and component tests. The browser suite checks desktop and mobile uploads, deep JSON rendering, keyboard-operated folding, copying complete JSON from folded or closed panels, independent raw controls, missing requests, and the explicit parse action for large pastes. Browser harnesses live under `tests/browser/` and do not ship in application routes.

Also run the audits, lint, TypeScript, full tests, and production build required by the repository guide.
