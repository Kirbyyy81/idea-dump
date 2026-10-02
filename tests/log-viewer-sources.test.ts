import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions, transactionHasError } from '@/lib/log-viewer/transactions';
import { contentEndpoints } from '@/lib/log-viewer/dictionary';

const fixture = (source: string) => readFileSync(`lib/log-viewer/fixtures/${source}.txt`, 'utf8');
const build = (text: string) => buildTransactions(parseLogText(text), { inactivityTimeoutMs: 0 });
const log = (...lines: string[]) => lines.map((line, i) => `2026-09-24 10:00:00.${String(i).padStart(3, '0')} ${line}`).join('\n');
const yes = (name: string) => `https://example.test/yesshop/mobile/ws/v1/json/${name}`;
const ussp = (name: string) => `https://example.test/ussp/tablet/ws/v1/json/${name}`;

describe('updated Yes Shop normalization', () => {
  it.each([
    ['getTodaySaleAmount', 'yesshop-admin/ws/v1/account/salesDailyTotalAmount'],
    ['getMonthlySaleAmount', 'yesshop-admin/ws/v1/account/salesMonthlyTotalAmount'],
    ['getWalletTopUpPaymentType', 'yesshop-admin/ws/v1/wallet/getTopUpPaymentType'],
    ['initiateCashWalletPayment', 'yesshop-wallet/ws/v1/wallet/initiateTopUpPayment'],
    ['getCvpTopUpAndCvpTransferHistoryTransactionData', 'yesshop-admin/ws/v1/cvptopup/getCVPHistory'],
    ['getCvpTransferLoadData', 'yesshop-admin/ws/v1/cvptransfer/cvpTransferLoadDetails'],
    ['getDealerOwnerStoreList', 'yesshop-admin/ws/v1/GetStoreList'],
  ])('matches %s to the observed endpoint, including orphan responses', (name, path) => {
    const url = 'https://example.test/' + path;
    for (const withRequest of [true, false]) {
      const result = build(log(`CONTENT DATA >>  ${name.toUpperCase()}  >> {"accountId":"sample-account"}`,
        ...(withRequest ? [`REQUEST >>>>>>> ${url} >>>>>> {"contentData":"encoded","sessionId":"sample"}`] : []),
        `RESPONSE SUCCESS1 >>>>>>> ${url} >>>>>> {"responseCode":0}`));
      expect(result.unmatchedContentData).toEqual([]);
      expect(result.transactions[0].contentData?.functionName).toBe(name.toUpperCase());
      expect(result.transactions[0].contentMatch).toEqual({ method: 'dictionary', confidence: 'medium' });
      expect(result.transactions[0].orphanKind).toBe(withRequest ? null : 'response');
      expect(result.transactions[0].responses[0].source).toBe('yes-shop');
    }
  });

  it('does not classify a success message in responseStatus.errorMessage as failure', () => {
    const result = build(log(`RESPONSE_SUCCESS >>>>>>> (200) >>>>>> ${yes('ReserveMSISDN')} >>>>>> ` +
      JSON.stringify({ responseStatus: { status: 'SUCCESSFUL', errorCode: '00', errorMessage: 'Operation Successfuly executed' } })));
    expect(transactionHasError(result.transactions[0])).toBe(false);
  });

  it.each([
    { responseStatus: { status: 'SUCCESSFUL', errorCode: 'E01', errorMessage: 'Failure' } },
    { responseStatus: { status: 'FAILED', errorCode: '00' } },
    { responseStatus: { status: 'SUCCESSFUL', errorCode: '00' }, responseCode: 1 },
    { responseStatus: { status: 'SUCCESSFUL', errorCode: '00' }, nested: { errorCode: 'E02' } },
    { responseStatus: { status: 'SUCCESSFUL', errorCode: '00', displayErrorMessage: 'Failure' } },
    { errorMessage: 'Unqualified failure' },
  ])('retains contradictory or unqualified failure evidence: %j', (body) => {
    const result = build(log(`RESPONSE_SUCCESS >>>>>>> (200) >>>>>> ${yes('Test')} >>>>>> ${JSON.stringify(body)}`));
    expect(transactionHasError(result.transactions[0])).toBe(true);
  });

  it.each(['RESPONSE_SUCCESS >>>>>>> (500)', 'RESPONSE_ERROR >>>>>>> (200)'])(
    'keeps transport and marker errors despite success payloads: %s', (marker) => {
      const result = build(log(`${marker} >>>>>> ${yes('Test')} >>>>>> {"responseStatus":{"status":"SUCCESSFUL","errorCode":"00"}}`));
      expect(transactionHasError(result.transactions[0])).toBe(true);
    });

  it('leaves duplicate requests, repeated content, pairing and concurrency unchanged', () => {
    const url = yes('ReserveMSISDN');
    const result = build(log(
      'CONTENT DATA >> getReserveNoContentData >> {"msisdn":"sample"}',
      'CONTENT DATA >> getReserveNoContentData >> {"msisdn":"sample"}',
      `REQUEST >>>>>>> ${url} >>>>>> {"contentData":"encoded","sessionId":"sample"}`,
      `REQUEST >>>>>>> POST >>>>>> URL: ${url} >>>>>> {"contentData":"encoded","sessionId":"sample"}`,
      `RESPONSE_SUCCESS >>>>>>> ${url} >>>>>> {"ok":true}`,
      `REQUEST >>>>>>> ${url} >>>>>> {"contentData":"encoded","sessionId":"sample"}`,
      `RESPONSE_SUCCESS >>>>>>> ${url} >>>>>> {"ok":true}`,
    ));
    expect(result.transactions.map((tx) => [tx.request?.lineNumber, tx.responses.map((event) => event.lineNumber), tx.orphanKind]))
      .toEqual([[3, [5], null], [4, [7], null], [6, [], 'request']]);
    expect(result.transactions.every((tx) => tx.hadConcurrency)).toBe(true);
    expect(result.unmatchedContentData.map((event) => event.lineNumber)).toEqual([1, 2]);
  });
});

describe('source-specific log parsing', () => {
  it('detects the source by URL paths, including records before the first URL', () => {
    for (const [file, source] of [['yes-shop', 'yes-shop'], ['ussp', 'ussp']]) {
      expect(new Set(parseLogText(fixture(file)).map((event) => event.source))).toEqual(new Set([source]));
    }
    for (const path of ['yesshop-admin/api/test', 'yesshop-report/api/test', 'yesshop-wallet/ws/v1/wallet/getCashWalletBalance', 'cots/api/yes-shop/v2/banners/list']) {
      expect(parseLogText(log(`REQUEST https://example.test/${path} {}`))[0].source).toBe('yes-shop');
    }
    expect(parseLogText(log('REQUEST https://ussp.example.test/other {}'))[0].source).toBe('unknown');
  });

  it('preserves bare endpoints without fabricating URLs and pairs their responses', () => {
    const result = build(fixture('yes-shop'));
    expect(result.unparsedLines).toEqual([]);
    for (const name of ['getPlanDeviceList', 'getPlanListByDevice', 'getPlanPriceInfo', 'GetMaterConfig']) {
      const tx = result.transactions.find((item) => item.request?.endpointName === name && !item.request.url)!;
      expect(tx).toBeDefined();
      expect(tx.request?.url).toBeUndefined();
      expect(tx.responses).toHaveLength(1);
      expect(tx.orphanKind).toBeNull();
      expect(tx.contentMatch?.method).toBe('dictionary');
    }
  });

  it('matches a bare endpoint to a single observed URL identity', () => {
    const { transactions } = build(log('REQUEST >>>>>>> GetMaterConfig >>>>>> {}', `RESPONSE SUCCESS1 >>>>>>> ${yes('GetMaterConfig')} >>>>>> {}`));
    expect(transactions).toHaveLength(1);
    expect(transactions[0].request?.url).toBeUndefined();
    expect(transactions[0].path).toBe('/yesshop/mobile/ws/v1/json/GetMaterConfig');
  });

  it('does not merge a bare endpoint with multiple host identities', () => {
    const result = build(log('REQUEST >>>>>>> GetMaterConfig >>>>>> {}',
      `RESPONSE SUCCESS1 >>>>>>> ${yes('GetMaterConfig')} >>>>>> {}`,
      'RESPONSE SUCCESS1 >>>>>>> https://other.test/yesshop/mobile/ws/v1/json/GetMaterConfig >>>>>> {}'));
    expect(result.transactions).toHaveLength(3);
    expect(result.orphanResponses).toHaveLength(2);
  });

  it('preserves case-sensitive full URL paths and does not infer status codes from payload strings', () => {
    const result = build(log('REQUEST https://example.test/Case {}',
      'RESPONSE https://example.test/case {"text":"not a status (500)"}'));
    expect(result.transactions).toHaveLength(2);
    expect(result.orphanResponses[0].responses[0].httpStatus).toBeUndefined();
    expect(parseLogText(log('RESPONSE >>>>>>> https://example.test/case >>>>>> "not a status (500)"'))[0].httpStatus).toBeUndefined();
  });

  it('classifies the log marker without matching keywords inside endpoints', () => {
    const events = parseLogText(log('REQUEST https://example.test/response {}',
      `REQUEST ${yes('request')} {}`, 'REQUEST >>>>>>> response >>>>>> {}'));
    expect(events.map((event) => event.lineType)).toEqual(['request', 'request', 'request']);
  });

  it('preserves raw multiline error records and reads the JSON after the transport envelope', () => {
    const events = parseLogText(fixture('ussp'));
    const response = events.find((event) => event.httpStatus === 500)!;
    expect(response.bodyJson).toEqual({ message: 'An unexpected error occurred', request_id: 'transport-1' });
    expect(response.bodyParseError).toBeUndefined();
    expect(response.rawLine).toContain('Response{protocol=h2, code=500');
    expect(response.endLineNumber).toBe(response.lineNumber + 3);
    const tx = build(fixture('ussp')).transactions.find((item) => item.responses.some((event) => event.httpStatus === 500))!;
    expect(tx.lineRefs).toContain(response.endLineNumber);
    expect(transactionHasError(tx)).toBe(true);
  });

  it('keeps malformed content as text without modifying its values', () => {
    const malformed = parseLogText(fixture('ussp')).filter((event) => event.bodyParseError);
    expect(malformed).toHaveLength(2);
    for (const event of malformed) {
      expect(event.bodyKind).toBe('text');
      expect(event.bodyJson).toBeUndefined();
      expect(event.rawLine).toContain(event.bodyRaw);
    }
    expect(parseLogText(log(`REQUEST ${yes('Test')} {"unfinished":`))[0].bodyParseError).toBe(true);
  });

  it('extracts empty, text and primitive bodies without mistaking header metadata for a body', () => {
    const events = parseLogText(log(
      `REQUEST >>>>>>> ${yes('Test')} >>>>>> (No Body)`,
      'AUTH_REQUEST >>>>>>> POST >>>>>> https://example.test/token',
      'AUTH_RESPONSE_SUCCESS >>>>>>> (200) >>>>>> https://example.test/token >>> 211 ms',
      `RESPONSE ERROR >>>>>>> ${yes('Test')} >>>>>> connection reset`,
      `RESPONSE >>>>>>> ${yes('Test')} >>>>>> null`,
      `RESPONSE >>>>>>> ${yes('Test')} >>>>>> "literal {} and >>> markers"`,
    ));
    expect(events.map((event) => event.bodyKind)).toEqual(['none', 'none', 'none', 'text', 'json', 'json']);
    expect(events[3].bodyRaw).toBe('connection reset');
    expect(events[4].bodyJson).toBeNull();
    expect(events[5].bodyJson).toBe('literal {} and >>> markers');
  });
});

describe('content matching', () => {
  it('preserves generic timeline, concurrency, orphan, and stack-trace behaviour', () => {
    const result = build(fixture('timeline-error-pairing'));
    expect(result.transactions).toHaveLength(8);
    expect(result.unparsedLines).toHaveLength(0);
    expect(result.orphanResponses).toHaveLength(1);
    expect(result.transactions.filter((tx) => tx.orphanKind === 'request')).toHaveLength(1);
    expect(result.transactions.filter((tx) => tx.hadConcurrency)).toHaveLength(2);
    expect(result.transactions.find((tx) => tx.request?.path === '/v1/accounts/detail')?.request?.bodyKind).toBe('none');
    const crash = result.transactions.find((tx) => tx.responses[0]?.lineType === 'crash')!;
    expect(crash.responses[0].rawLine).toContain('java.lang.NullPointerException');
    expect(transactionHasError(crash)).toBe(true);
  });

  it('does not let nearby unrelated requests consume named content', () => {
    const { transactions, unmatchedContentData } = build(fixture('yes-shop'));
    const master = transactions.filter((tx) => tx.request?.endpointName === 'GetMasterData');
    expect(master.map((tx) => tx.contentData?.lineNumber)).toEqual([1, 3]);
    expect(transactions.find((tx) => tx.request?.endpointName === 'GetGoogleApiKey')?.contentData).toBeUndefined();
    expect(transactions.find((tx) => tx.request?.lineNumber === 7)?.contentData?.lineNumber).toBe(5);
    expect(transactions.find((tx) => tx.request?.endpointName === 'GetAppVersion')?.contentData).toBeUndefined();
    expect(unmatchedContentData).toHaveLength(0);
  });

  it('uses future response IDs before dictionary or proximity matching', () => {
    const { transactions } = build(fixture('ussp'));
    const notifications = transactions.filter((tx) => tx.request?.endpointName === 'getUserWorkFlowNotifications' && tx.contentData);
    expect(notifications.map((tx) => tx.contentData?.requestId)).toEqual(['notification-1', 'notification-2']);
    expect(notifications.every((tx) => tx.contentMatch?.confidence === 'high')).toBe(true);
    expect(transactions.find((tx) => tx.request?.endpointName === 'getMasterConfig')?.contentData?.bodyJson).toEqual({ configName: 'CHECK_CONFIG' });
    expect(transactions.filter((tx) => tx.request?.endpointName === 'getUpdatedCustomerDetail').every((tx) => !tx.contentData)).toBe(true);
  });

  it('uses conservative proximity to skip session-only polling even without response IDs', () => {
    const { transactions } = build(log('JSON DATA String - {"requestId":"n-1"}',
      `POST REQUEST >>>>>>> ${ussp('getUpdatedCustomerDetail')} >>>>>> {"sessionId":"s"}`,
      `POST REQUEST >>>>>>> ${ussp('getUserWorkFlowNotifications')} >>>>>> {"sessionId":"s","contentData":"encoded"}`,
      `RESPONSE ERROR >>>>>>> ${ussp('getUserWorkFlowNotifications')} >>>>>> {"message":"failed"}`));
    expect(transactions.find((tx) => tx.request?.endpointName === 'getUpdatedCustomerDetail')?.contentData).toBeUndefined();
    expect(transactions.find((tx) => tx.request?.endpointName === 'getUserWorkFlowNotifications')?.contentMatch).toEqual({ method: 'proximity', confidence: 'low' });
  });

  it('uses content IDs to prevent an earlier missing response from shifting later USSP pairs', () => {
    const { transactions } = build(log('JSON DATA String - {"requestId":"old"}',
      `POST REQUEST >>>>>>> ${ussp('getUserWorkFlowNotifications')} >>>>>> {"contentData":"old-encoded"}`,
      'JSON DATA String - {"requestId":"new"}',
      `POST REQUEST >>>>>>> ${ussp('getUpdatedCustomerDetail')} >>>>>> {"sessionId":"s"}`,
      `POST REQUEST >>>>>>> ${ussp('getUserWorkFlowNotifications')} >>>>>> {"contentData":"new-encoded"}`,
      `RESPONSE SUCCESS >>>>>>> ${ussp('getUserWorkFlowNotifications')} >>>>>> {"responseId":"new","responseCode":0}`));
    expect(transactions.find((tx) => tx.request?.lineNumber === 2)?.responses).toHaveLength(0);
    const paired = transactions.find((tx) => tx.request?.lineNumber === 5)!;
    expect(paired.responses[0].lineNumber).toBe(6);
    expect(paired.contentData?.requestId).toBe('new');
    expect(paired.contentMatch?.confidence).toBe('high');
  });

  it('groups content with orphan responses and preserves the missing request status', () => {
    for (const source of ['yes-shop', 'ussp']) {
      const { orphanResponses } = build(fixture(source));
      expect(orphanResponses.length).toBeGreaterThan(0);
      for (const tx of orphanResponses) {
        expect(tx.request).toBeUndefined();
        expect(tx.orphanKind).toBe('response');
        expect(tx.contentData).toBeDefined();
        expect(tx.lineRefs).toContain(tx.contentData?.lineNumber);
      }
    }
  });

  it('pairs an endpointless eKYC result only to one compatible upload request', () => {
    const tx = build(fixture('yes-shop')).transactions.find((item) => item.request?.endpointName === 'uploadMyKadImage')!;
    expect(tx.responses).toHaveLength(1);
    expect(tx.confidence).toBe('low');
    expect(tx.contentMatch?.confidence).toBe('medium');
    const ambiguous = build(log(`REQUEST ${yes('Other')} {}`,
      'REQUEST https://example.test/ekyc/ws/v1/json/uploadMyKadImage {}',
      'REQUEST https://example.test/ekyc/ws/v1/json/uploadPassportImage {}',
      'RESPONSE duration >> 15 >> RESULT {"imageId":"a","id_expected_confidence":90}'));
    expect(ambiguous.orphanResponses).toHaveLength(1);
  });

  it('does not force dictionary matches when two targets are eligible', () => {
    const result = build(log('CONTENT DATA >> getProductDeviceList >> {}',
      `REQUEST ${yes('getPlanDeviceList')} {}`, `REQUEST ${yes('getPlanDeviceList')} {}`));
    expect(result.unmatchedContentData).toHaveLength(1);
    expect(result.transactions.every((tx) => !tx.contentData)).toBe(true);
  });

  it('never falls back to proximity after a known dictionary mismatch', () => {
    const result = build(log('JSON DATA String - {"amount":1,"requestId":"a"}',
      `POST REQUEST >>>>>>> ${ussp('getManuals')} >>>>>> {"contentData":"encoded"}`));
    expect(result.unmatchedContentData).toHaveLength(1);
  });

  it('uses the USSP master-data signature instead of a nearby unrelated orphan response', () => {
    const result = build(log('JSON DATA String - {"masterDataType":"COUNTRY","requestId":"master-1"}',
      `POST REQUEST >>>>>>> ${ussp('getMasterData')} >>>>>> {"contentData":"encoded"}`,
      `RESPONSE SUCCESS >>>>>>> ${ussp('getMasterData')} >>>>>> {"responseCode":0}`,
      `RESPONSE SUCCESS >>>>>>> ${ussp('unrelated')} >>>>>> {"responseCode":0}`));
    expect(result.unmatchedContentData).toHaveLength(0);
    expect(result.transactions[0].contentMatch).toEqual({ method: 'dictionary', confidence: 'medium' });
    expect(result.orphanResponses[0].contentData).toBeUndefined();
  });

  it('does not cross sources or mixed-input boundaries, even with identical IDs', () => {
    const result = build(log(`REQUEST ${yes('Test')} {"requestId":"same"}`,
      'CONTENT DATA >> Test >> {"requestId":"same"}',
      `RESPONSE SUCCESS >>>>>>> ${ussp('Test')} >>>>>> {"responseId":"same"}`,
      `RESPONSE SUCCESS >>>>>>> ${yes('Test')} >>>>>> {"responseId":"same"}`));
    expect(result.transactions).toHaveLength(3);
    expect(result.orphanResponses).toHaveLength(2);
    expect(result.unmatchedContentData[0].source).toBe('unknown');
  });

  it('keeps unnamed generic content unmatched and enforces the ten-event proximity window', () => {
    const result = build(log('JSON DATA String - {"value":1}',
      'REQUEST https://example.test/generic {"contentData":"encoded"}'));
    expect(result.unmatchedContentData).toHaveLength(1);
    const distant = build(log('JSON DATA String - {"value":1}',
      ...Array.from({ length: 10 }, () => 'App Version Code: 1'),
      `POST REQUEST >>>>>>> ${ussp('Test')} >>>>>> {"contentData":"encoded"}`));
    expect(distant.unmatchedContentData).toHaveLength(1);
  });

  it('normalises dictionary names and keeps source dictionaries isolated', () => {
    const event = parseLogText(log('CONTENT DATA >> GET MASTER Country LIST >> {}', `REQUEST ${yes('GetMasterData')} {}`))[0];
    expect(contentEndpoints(event)).toEqual(['getmasterdata']);
    expect(contentEndpoints({ ...event, source: 'ussp' })).toEqual(['getmastercountrylist']);
  });
});
