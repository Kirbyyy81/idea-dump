import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTypescriptModule(path, exportsToAssign) {
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(/import[\s\S]*?from ['"][^'"]+['"];\r?\n/g, '');
  source = source.replace(/export function /g, 'function ');
  source = source.replace(/export const /g, 'const ');
  source += `\n${exportsToAssign}`;

  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  vm.runInThisContext(output, { filename: path });
}

loadTypescriptModule(
  'lib/logViewer/parse.ts',
  'globalThis.parseLogText = parseLogText; globalThis.parseLogLine = parseLogLine;',
);
loadTypescriptModule(
  'lib/logViewer/transactions.ts',
  'globalThis.buildTransactions = buildTransactions; globalThis.transactionHasError = transactionHasError;',
);

function parseOne(line) {
  const [event] = globalThis.parseLogText(line);
  assert.ok(event, 'expected one parsed event');
  return event;
}

function findTxByPath(transactions, path) {
  return transactions.find((tx) => tx.path === path || tx.endpointKey === path);
}

const jsonData = parseOne(
  '2026-06-18 09:46:07.095 JSON DATA String - {"requestId":"REQ-100","accountId":"4491"}',
);
assert.equal(jsonData.lineType, 'content_data');
assert.equal(jsonData.requestId, 'REQ-100');
assert.equal(jsonData.bodyKind, 'json');
assert.equal(jsonData.bodyJson.accountId, '4491');

const authRequest = parseOne(
  '2026-06-18 09:31:06.697 AUTH_REQUEST  >>>>>>> POST  >>>>>> https://example.test/api/v2/openid-connect/token',
);
assert.equal(authRequest.lineType, 'request');
assert.equal(authRequest.method, 'POST');
assert.equal(authRequest.host, 'example.test');
assert.equal(authRequest.path, '/api/v2/openid-connect/token');

const authResponse = parseOne(
  '2026-06-18 09:31:06.907 AUTH_RESPONSE_SUCCESS  >>>>>>> (200)  >>>>>> https://example.test/api/v2/openid-connect/token >>> 211 ms',
);
assert.equal(authResponse.lineType, 'response');
assert.equal(authResponse.httpStatus, 200);
assert.equal(authResponse.durationMs, 211);

const ekycRequest = parseOne(
  '2026-06-18 09:45:31.150 REQUEST  https://example.test/ekyc/ws/v1/json/uploadMyKadImage   {"requestId":"REQ-200","clientRequestId":"CLIENT-200"}',
);
assert.equal(ekycRequest.lineType, 'request');
assert.equal(ekycRequest.path, '/ekyc/ws/v1/json/uploadMyKadImage');
assert.equal(ekycRequest.requestId, 'REQ-200');
assert.equal(ekycRequest.clientRequestId, 'CLIENT-200');

const durationResponse = parseOne(
  '2026-06-18 09:45:49.705 RESPONSE duration >> 138897140 >> RESULT  {"responseId":"REQ-200","responseCode":"0"}',
);
assert.equal(durationResponse.lineType, 'response');
assert.equal(durationResponse.durationMs, 138897140);
assert.equal(durationResponse.responseId, 'REQ-200');

const infoLine = parseOne(
  '2026-06-18 09:46:06.759 App Version Code: 719 App Version Name: 0.1.255-beta Manufacturer: samsung',
);
assert.equal(infoLine.lineType, 'info');
assert.equal(infoLine.eventType, 'App Version');

const correlatedLog = [
  '2026-06-18 09:46:07.095 CONTENT DATA >> getCustomer >>  {"requestId":"REQ-300","customerId":"C-1"}',
  '2026-06-18 09:46:07.202 REQUEST  >>>>>>> POST  >>>>>> URL: https://example.test/customer/details >>>>>> {"requestId":"REQ-300"}',
  '2026-06-18 09:46:07.969 RESPONSE_SUCCESS  >>>>>>> (200)  >>>>>> https://example.test/customer/details >>>>>> {"responseId":"REQ-300","responseCode":"0"}',
].join('\n');
const correlated = globalThis.buildTransactions(globalThis.parseLogText(correlatedLog), {
  inactivityTimeoutMs: 0,
});
assert.equal(correlated.transactions.length, 1);
assert.equal(correlated.transactions[0].request?.requestId, 'REQ-300');
assert.equal(correlated.transactions[0].responses[0]?.responseId, 'REQ-300');
assert.equal(correlated.transactions[0].contentData?.functionName, 'getCustomer');
assert.equal(correlated.transactions[0].confidence, 'high');
assert.equal(correlated.unmatchedContentData.length, 0);

const fallbackLog = [
  '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://example.test/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"sessionId":"S-1"}',
  '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://example.test/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"responseCode":0,"responseStatus":{"status":"SUCCESS"}}',
].join('\n');
const fallback = globalThis.buildTransactions(globalThis.parseLogText(fallbackLog), {
  inactivityTimeoutMs: 0,
});
assert.equal(fallback.transactions.length, 1);
assert.equal(fallback.transactions[0].path, '/ussp/tablet/ws/v1/json/updateSelectedStore');
assert.equal(fallback.transactions[0].responses.length, 1);
assert.equal(fallback.transactions[0].confidence, 'medium');

const orphanLog = [
  '2026-06-18 09:33:02.381 RESPONSE ERROR3  >>>>>>> https://example.test/user/getUserData  >>>>>> {"errorCode":"ERR-1","displayErrorMessage":"Invalid token"}',
].join('\n');
const orphan = globalThis.buildTransactions(globalThis.parseLogText(orphanLog), {
  inactivityTimeoutMs: 0,
});
assert.equal(orphan.transactions.length, 1);
assert.equal(orphan.transactions[0].orphanKind, 'response');
assert.equal(globalThis.transactionHasError(orphan.transactions[0]), true);

console.log('Log Viewer parser tests passed');
