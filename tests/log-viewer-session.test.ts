import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLogLine, parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions } from '@/lib/log-viewer/transactions';

const url = 'https://example.test/yesshop/mobile/ws/v1/json/Login';
const parse = (text: string) => parseLogLine('2026-10-15 10:00:00.000 ' + text, 1);

describe('source-backed session and payload formats', () => {
  it('keeps refresh tokens in the body and out of event titles and endpoint keys', () => {
    const token = 'synthetic.' + 'a'.repeat(1500) + '.signature';
    const event = parse('New Refresh Token Generated>>> ' + token);
    expect(event).toMatchObject({ eventType: 'Refresh Token Generated', endpointKey: 'Refresh Token Generated', lineType: 'info', bodyRaw: token });
    expect(event.rawLine).toContain(token);
  });

  it.each([401, 403, 500])('extracts HTTP %s and preserves both sides of a JSON payload', status => {
    const event = parse('RESPONSE ERROR1 >>>>>>> ' + url + ' >>>>>> Error Code - ' + status + ' {"request_id":"r-1"} retry pending');
    expect(event).toMatchObject({ httpStatus: status, requestId: 'r-1', bodyKind: 'json', bodyJson: { request_id: 'r-1' }, bodyPrefix: 'Error Code - ' + status, bodySuffix: 'retry pending' });
    expect(event.rawLine).toContain('retry pending');
  });

  it.each(['"retrofit2.HttpException: HTTP 400 "', 'retrofit2.HttpException: HTTP 400 '])('extracts a narrow Retrofit exception status from %s', body => {
    expect(parse('RESPONSE ERROR1 >>>>>>> ' + url + ' >>>>>> ' + body).httpStatus).toBe(400);
  });

  it('does not use error codes or durations inside arbitrary body values as transport metadata', () => {
    const event = parse('RESPONSE_SUCCESS >>>>>>> ' + url + ' >>>>>> {"note":"Error Code - 401 >>> 555 ms duration >> 777 >>","nested":{"message":"retrofit2.HttpException: HTTP 400"}}');
    expect(event.httpStatus).toBeUndefined();
    expect(event.durationMs).toBeUndefined();
    expect(parse('AUTH_RESPONSE_SUCCESS >>> (200) >>> ' + url + ' >>> 211 ms').durationMs).toBe(211);
    expect(parse('RESPONSE duration >> 42 >> RESULT {"ok":true}').durationMs).toBe(42);
  });

  it('retains all surrounding text for malformed payloads', () => {
    const text = 'before {"broken": } after';
    expect(parse('RESPONSE ERROR1 >>> ' + url + ' >>> ' + text)).toMatchObject({ bodyKind: 'text', bodyRaw: text, bodyParseError: true });
  });

  it.each(['2026-10-15 10:00:00.123', '2026-10-15T10:00:00.123', '2026-10-15 10:00:00,123'])('accepts timestamp separator %s without losing line ranges', timestamp => {
    const events = parseLogText(timestamp + ' RESPONSE ' + url + ' {\r\n"response_id":"r-2", "client_request_id":17\r\n}\r\n2026-10-15 10:00:01.000 INFO >>> next');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ lineNumber: 1, endLineNumber: 3, responseId: 'r-2', clientRequestId: '17' });
    expect(events[0].timestampMs).toBeDefined();
  });

  it.each([
    ['verifyCtosReport', 'VerifyCTOSCredit'],
    ['verifyCtosReport', 'verifyCtosReport'],
    ['getPrepaidDeviceListPartNumber', 'getDevicePartNos'],
    ['Postpaid Registration', 'ProcessPostpaidAccountConversion'],
  ])('matches the verified Yes Shop alias %s without requiring IDs', (name, endpoint) => {
    const marker = name === 'Postpaid Registration' ? name + ' >>>>>>>>>>' : 'CONTENT DATA >> ' + name + ' >>';
    const events = parseLogText([
      '2026-10-15 10:00:00.000 ' + marker + ' {"sample":"synthetic"}',
      '2026-10-15 10:00:00.010 REQUEST >>>>>>> ' + endpoint + ' >>>>>> {"contentData":"synthetic"}',
      '2026-10-15 10:00:00.020 RESPONSE SUCCESS1 >>>>>>> https://example.test/yesshop/mobile/ws/v1/json/' + endpoint + ' >>>>>> {}',
    ].join('\n'));
    const result = buildTransactions(events, { inactivityTimeoutMs: 0 });
    expect(result.unmatchedContentData).toHaveLength(0);
    expect(result.transactions[0].contentData?.functionName).toBe(name);
    expect(result.transactions[0].contentMatch).toEqual({ method: 'dictionary', confidence: 'medium' });
  });

  it('does not apply the postpaid content marker to other sources', () => {
    const events = parseLogText('2026-10-15 10:00:00.000 Postpaid Registration >>> {}\n2026-10-15 10:00:00.010 REQUEST https://example.test/ussp/v1/ProcessPostpaidAccountConversion {}');
    expect(events[0].lineType).toBe('info');
  });

  it('keeps ambiguous aliases unmatched rather than choosing a nearby endpoint', () => {
    const events = parseLogText([
      '2026-10-15 10:00:00.000 CONTENT DATA >> verifyCtosReport >> {"customer":"sample"}',
      '2026-10-15 10:00:00.010 REQUEST https://example.test/yesshop/v1/VerifyCTOSCredit {}',
      '2026-10-15 10:00:00.020 REQUEST https://example.test/yesshop/v1/verifyCtosReport {}',
    ].join('\n'));
    expect(buildTransactions(events, { inactivityTimeoutMs: 0 }).unmatchedContentData).toHaveLength(1);
  });

  it('preserves every synthetic fixture record and keeps unknown content accessible', () => {
    const events = parseLogText(readFileSync('lib/log-viewer/fixtures/yes-shop-session.txt', 'utf8'));
    const result = buildTransactions(events, { inactivityTimeoutMs: 0 });
    expect(result.unparsedLines).toHaveLength(2);
    expect(result.unmatchedContentData.map(event => event.functionName)).toEqual(['UnknownDiagnostic']);
    const recorded = result.transactions.flatMap(tx => [tx.request, tx.contentData, ...tx.responses].filter(Boolean));
    expect(recorded.length + result.unparsedLines.length + result.unmatchedContentData.length).toBe(events.length);
  });
});
