const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function loadTs(file) {
  const abs = path.resolve(root, file);
  if (cache.has(abs)) return cache.get(abs).exports;

  const source = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = new Module(abs, module);
  cache.set(abs, mod);
  mod.filename = abs;
  mod.paths = Module._nodeModulePaths(path.dirname(abs));
  mod.require = (id) => {
    if (id.startsWith('@/')) return loadTs(`${id.slice(2)}.ts`);
    return require(id);
  };
  mod._compile(js, abs);
  return mod.exports;
}

const { parseLogText } = loadTs('lib/logViewer/parse.ts');
const { buildTransactions, transactionHasError } = loadTs('lib/logViewer/transactions.ts');

function firstTransactionHasError(logText) {
  const parsed = parseLogText(logText);
  const { transactions } = buildTransactions(parsed, { inactivityTimeoutMs: 0 });
  assert.strictEqual(transactions.length, 1, 'expected one transaction');
  return transactionHasError(transactions[0]);
}

const successPayload = [
  '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"requestId":"abc"}',
  '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"loginId":null,"responseId":null,"responseCode":0,"responseMessage":null,"displayResponseMessage":null,"contentData":null,"sessionId":null,"responseStatus":{"status":"SUCCESS","errorCode":null,"errorMessage":null,"description":null}}',
].join('\n');

const failurePayload = [
  '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"requestId":"abc"}',
  '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"responseCode":0,"responseStatus":{"status":"FAILED","errorCode":null,"errorMessage":"store update failed"}}',
].join('\n');

assert.strictEqual(
  firstTransactionHasError(successPayload),
  false,
  'successful response with null errorCode/errorMessage should not be flagged',
);
assert.strictEqual(
  firstTransactionHasError(failurePayload),
  true,
  'response with a real errorMessage should be flagged',
);

console.log('log viewer regression tests passed');
