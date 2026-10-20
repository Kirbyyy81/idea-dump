import { describe, expect, it } from 'vitest';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions } from '@/lib/log-viewer/transactions';
import { eventMatches, groupUnparsedLines, sessionContext, timelineRows, transactionMatches, unparsedMatches } from '@/lib/log-viewer/presentation';
import type { LogViewerFilters } from '@/lib/types';

const filters: LogViewerFilters = { query: '', endpoint: '', source: '', lineType: '', status: '', errorsOnly: false, section: 'all' };
const make = (...lines: string[]) => {
  const events = parseLogText(lines.map((line, i) => '2026-10-15 10:00:' + String(i).padStart(2, '0') + '.000 ' + line).join('\n'));
  return { events, ...buildTransactions(events, { inactivityTimeoutMs: 0 }) };
};

describe('Log Viewer presentation and filtering', () => {
  it('automatically groups consecutive reader diagnostics and payloads regardless of elapsed time', () => {
    const result = make('REQUEST https://a.test/ussp/v1/Begin {}',
      'SECURE_METRIC_READER >>>>>>> synthetic-flow >>>>>> session=test event=STATE state=READY',
      'SECURE_METRIC_READER_DATA >>>>>>> synthetic-flow >>>>>> session=test event=RESULT payload={"value":"001"}',
      'SECURE_METRIC_READER >>>>>>> synthetic-flow >>>>>> session=test event=FINISHED');
    result.transactions.at(-1)!.startedAtMs! += 120000;
    const before = JSON.stringify(result);
    const rows = timelineRows(result.transactions, new Set(result.transactions.map(tx => tx.id)), false, result.events);
    expect(rows.map(row => [row.kind, row.transactions.length])).toEqual([['transaction', 1], ['reader', 3]]);
    expect(rows.flatMap(row => row.transactions)).toEqual(result.transactions);
    expect(JSON.stringify(result)).toBe(before);
  });

  it('keeps reader block boundaries across hidden business, unmatched, unparsed and source-transition records', () => {
    const reader = 'SECURE_METRIC_READER >>>>>>> synthetic-flow >>>>>> session=test event=STATE';
    const result = make('REQUEST https://a.test/ussp/v1/Begin {}', reader, reader,
      'REQUEST https://a.test/ussp/v1/Other {}', reader,
      'CONTENT DATA >> Unknown >> {}', reader,
      'REQUEST >>> (No Body)', reader,
      'REQUEST https://b.test/yesshop/v1/Other {}', reader);
    const visible = new Set(result.transactions.filter(tx => tx.responses[0]?.eventType === 'SECURE_METRIC_READER').map(tx => tx.id));
    for (const groupAuth of [true, false]) {
      const rows = timelineRows(result.transactions, visible, groupAuth, result.events);
      expect(rows.map(row => row.transactions.length)).toEqual([2, 1, 1, 1, 1]);
      expect(rows.every(row => row.kind === 'reader')).toBe(true);
    }
  });

  it('filters reader events individually while preserving the remaining block and rejecting lookalike titles', () => {
    const result = make('SECURE_METRIC_READER >>>>>>> flow >>>>>> event=READY',
      'SECURE_METRIC_READER_DATA >>>>>>> flow >>>>>> payload={"errorCode":9}',
      'SECURE_METRIC_READER_EXTRA >>>>>>> unrelated');
    const visible = new Set(result.transactions.filter(tx => transactionMatches(tx, { ...filters, status: 'errors' })).map(tx => tx.id));
    const rows = timelineRows(result.transactions, visible, false, result.events);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('reader');
    expect(rows[0].transactions).toEqual([result.transactions[1]]);
    expect(timelineRows(result.transactions, new Set(result.transactions.map(tx => tx.id)), false, result.events).at(-1)?.kind).toBe('transaction');
  });

  it('searches and filters standalone content using the same criteria as the timeline', () => {
    const { unmatchedContentData } = make('CONTENT DATA >> Unknown >> {"needle":"match"}', 'REQUEST https://a.test/yesshop/v1/Other {}');
    const event = unmatchedContentData[0];
    expect(eventMatches(event, { ...filters, query: 'NEEDLE', source: 'yes-shop', lineType: 'content_data' })).toBe(true);
    expect(eventMatches(event, { ...filters, query: 'absent' })).toBe(false);
    expect(eventMatches(event, { ...filters, source: 'ussp' })).toBe(false);
    expect(eventMatches(event, { ...filters, status: 'orphans' })).toBe(false);
    expect(eventMatches(event, { ...filters, errorsOnly: true })).toBe(false);
  });

  it('groups only adjacent unparsed lines before filtering without mutating originals', () => {
    const lines = [{ rawLine: 'first', lineNumber: 1 }, { rawLine: 'needle', lineNumber: 2 }, { rawLine: 'later', lineNumber: 4 }];
    const grouped = groupUnparsedLines(lines);
    expect(grouped).toEqual([{ rawLine: 'first\nneedle', lineNumber: 1, endLineNumber: 2 }, { rawLine: 'later', lineNumber: 4 }]);
    expect(lines[0].rawLine).toBe('first');
    expect(unparsedMatches(grouped[0], { ...filters, query: 'needle', section: 'unparsed' })).toBe(true);
    expect(unparsedMatches(grouped[0], { ...filters, lineType: 'response' })).toBe(false);
    expect(unparsedMatches(grouped[0], { ...filters, errorsOnly: true })).toBe(false);
    expect(unparsedMatches({ rawLine: 'REQUEST >>> {}', lineNumber: 1, lineType: 'request' }, { ...filters, lineType: 'request' })).toBe(true);
  });

  it('groups consecutive auth rows only and never joins across filtered business records', () => {
    const result = make('New Auth Token Requested>>>', 'New Refresh Token Generated>>> synthetic',
      'REQUEST https://a.test/yesshop/v1/Business {}', 'New Auth Token Requested>>>', 'New Refresh Token Generated>>> synthetic');
    const visible = new Set(result.transactions.filter(tx => !tx.request).map(tx => tx.id));
    const rows = timelineRows(result.transactions, visible, true, result.events);
    expect(rows.map(row => row.transactions.length)).toEqual([2, 2]);
    expect(timelineRows(result.transactions, visible, false, result.events).map(row => row.transactions.length)).toEqual([1, 1, 1, 1]);
    expect(result.transactions).toHaveLength(5);
  });

  it('does not merge auth rows across unmatched content, sources, backwards time or long gaps', () => {
    const result = make('New Auth Token Requested>>>', 'CONTENT DATA >> Unknown >> {}', 'New Refresh Token Generated>>> synthetic',
      'REQUEST https://a.test/yesshop/v1/Business {}', 'New Auth Token Requested>>>',
      'REQUEST https://b.test/ussp/v1/Business {}', 'New Refresh Token Generated>>> synthetic');
    const visible = new Set(result.transactions.map(tx => tx.id));
    expect(timelineRows(result.transactions, visible, true, result.events).every(row => row.transactions.length === 1)).toBe(true);
    const pair = make('New Auth Token Requested>>>', 'New Refresh Token Generated>>> synthetic');
    pair.transactions[1].startedAtMs = pair.transactions[0].startedAtMs! + 60000;
    expect(timelineRows(pair.transactions, new Set(pair.transactions.map(tx => tx.id)), true)).toHaveLength(2);
    pair.transactions[1].startedAtMs = pair.transactions[0].startedAtMs! - 1;
    expect(timelineRows(pair.transactions, new Set(pair.transactions.map(tx => tx.id)), true)).toHaveLength(2);
  });

  it('shows bounded recorded context for a 401 without altering transaction pairing', () => {
    const url = 'https://a.test/yesshop/v1/Login';
    const result = make('RESPONSE ERROR1 >>> ' + url + ' >>> Error Code - 401 {}', 'New Auth Token Requested>>>',
      'New Refresh Token Generated>>> synthetic', 'REQUEST ' + url + ' {}', 'RESPONSE ' + url + ' {}');
    const first = result.transactions[0];
    expect(sessionContext(first, result.transactions)).toHaveLength(4);
    expect(sessionContext(result.transactions[1], result.transactions)).toEqual([]);
    expect(first.orphanKind).toBe('response');
    result.transactions[1].responses[0].sourceSegment = 99;
    expect(sessionContext(first, result.transactions)).toHaveLength(3);
  });

  it('combines source, status, section, type, endpoint and search filters', () => {
    const result = make('REQUEST https://a.test/yesshop/v1/Login {}', 'RESPONSE ERROR1 >>> https://a.test/yesshop/v1/Login >>> Error Code - 401 {}');
    const tx = result.transactions[0];
    expect(transactionMatches(tx, { ...filters, source: 'yes-shop', status: 'errors', query: '401', lineType: 'response' })).toBe(true);
    for (const extra of [{ source: 'ussp' }, { section: 'unmatched' as const }, { status: 'orphans' }, { endpoint: 'other' }]) {
      expect(transactionMatches(tx, { ...filters, ...extra })).toBe(false);
    }
  });
});
