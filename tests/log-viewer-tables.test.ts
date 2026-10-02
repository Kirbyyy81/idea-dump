import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions } from '@/lib/log-viewer/transactions';
import { parseTableDump } from '@/lib/log-viewer/tables';

const build = (text: string) => buildTransactions(parseLogText(text), { inactivityTimeoutMs: 0 });
const line = (time: string, text: string) => `2026-10-02 10:00:${time} ${text}`;
const table = (name: string, row = 'id=0007, blank=, value=null') => `=== Table: ${name} ======Row: ${row}`;

describe('logged table batches', () => {
  it('preserves four ordered batches of eight tables, raw events and every line reference', () => {
    const raw = readFileSync('lib/log-viewer/fixtures/yes-shop-tables.txt', 'utf8');
    const events = parseLogText(raw);
    const before = JSON.stringify(events);
    const result = buildTransactions(events, { inactivityTimeoutMs: 0 });
    const batches = result.transactions.filter((tx) => tx.tableBatch);
    expect(events).toHaveLength(40);
    expect(result.transactions).toHaveLength(8);
    expect(batches.map((tx) => tx.tableBatch!.length)).toEqual([8, 8, 8, 8]);
    expect(batches.map((tx) => tx.tableBatch![0].name)).toEqual([
      'addressDetails', 'minorIcScanDetails', 'addressDetails', 'addressDetails',
    ]);
    for (const [index, tx] of batches.entries()) {
      // The final raw record also retains the fixture's trailing blank line.
      expect(tx.lineRefs).toEqual(Array.from({ length: index === 3 ? 9 : 8 }, (_, i) => index * 10 + 3 + i));
      expect(tx.responses).toEqual(events.slice(index * 10 + 2, index * 10 + 10));
      expect(tx.tableBatch!.filter((dump) => dump.empty)).toHaveLength(3);
      expect(tx.orphanKind).toBeNull();
      expect(raw.replace(/\r\n/g, '\n')).toContain(tx.responses.map((event) => event.rawLine).join('\n'));
    }
    expect(JSON.stringify(events)).toBe(before);
  });

  it('preserves strings, blanks, commas, equals signs and nested or quoted assignments', () => {
    const row = 'id=0007, blank=, value=null, address=Unit 7, Example Road, expression=a=b, json={"text":"x, name=y"}, quoted="x, name=y", end=false';
    expect(parseTableDump(table('addressDetails', row))!.rows[0].fields).toEqual([
      { name: 'id', value: '0007' }, { name: 'blank', value: '' }, { name: 'value', value: 'null' },
      { name: 'address', value: 'Unit 7, Example Road' }, { name: 'expression', value: 'a=b' },
      { name: 'json', value: '{"text":"x, name=y"}' }, { name: 'quoted', value: '"x, name=y"' },
      { name: 'end', value: 'false' },
    ]);
  });

  it('separates multiple rows but leaves row markers inside quoted values intact', () => {
    const dump = parseTableDump(table('items', 'id=1, text="======Row: id=9"') + '======Row: id=2\nRow: id=3')!;
    expect(dump.rows).toHaveLength(3);
    expect(dump.rows[0].fields![1].value).toBe('"======Row: id=9"');
    expect(dump.rows.slice(1).map((row) => row.fields![0].value)).toEqual(['2', '3']);
  });

  it.each(['broken row', 'id=1, value="unfinished', 'id=1, value={]'])('retains malformed rows as text: %s', (row) => {
    const dump = parseTableDump(table('items', row))!;
    expect(dump.rows[0].fields).toBeUndefined();
    expect(dump.rows[0].rawText).toContain(row);
  });

  it('preserves malformed table content without an initial row marker', () => {
    expect(parseTableDump('=== Table: items ======unrecognized content')!.rows).toEqual([{ rawText: 'unrecognized content' }]);
    expect(parseTableDump('Table items is empty')!.rows).toEqual([]);
    expect(parseTableDump('ordinary info about a Table: items')).toBeUndefined();
  });

  it('splits on repeated names, gaps and backwards timestamps but allows a one-second gap', () => {
    const result = build([line('00.000', table('a')), line('01.000', table('b')), line('01.001', table('a')),
      line('02.002', table('c')), line('01.999', table('d'))].join('\n'));
    expect(result.transactions.map((tx) => tx.tableBatch?.map((dump) => dump.name))).toEqual([['a', 'b'], ['a'], ['c'], ['d']]);
  });

  it.each(['ordinary info', 'CONTENT DATA >> unmatched >> {}', 'REQUEST https://example.test/yesshop/Test {}'])(
    'splits on an intervening event: %s', (between) => {
      const result = build([line('00.000', table('a')), line('00.001', between), line('00.002', table('b'))].join('\n'));
      expect(result.transactions.filter((tx) => tx.tableBatch).map((tx) => tx.tableBatch!.length)).toEqual([1, 1]);
    });

  it('never groups across resolved source segments', () => {
    const events = parseLogText([line('00.000', table('a')), line('00.001', table('b'))].join('\n'));
    events[0].source = 'yes-shop'; events[0].sourceSegment = 0;
    events[1].source = 'ussp'; events[1].sourceSegment = 1;
    expect(buildTransactions(events, { inactivityTimeoutMs: 0 }).transactions).toHaveLength(2);
  });

  it('keeps marker-like values as info and leaves correlation distances intact', () => {
    const raw = [line('00.000', 'CONTENT DATA >> getIcScanConfigData >> {"configName":"sample"}'),
      ...Array.from({ length: 10 }, (_, i) => line(`00.${String(i + 1).padStart(3, '0')}`, table(`t${i}`, 'text=REQUEST ERROR RESULT'))),
      line('00.020', 'REQUEST https://example.test/yesshop/GetMaterConfig {}'),
      line('00.030', 'RESPONSE https://example.test/yesshop/GetMaterConfig {}')].join('\n');
    const result = build(raw);
    expect(result.transactions.filter((tx) => tx.tableBatch)).toHaveLength(1);
    expect(result.transactions.find((tx) => tx.tableBatch)!.responses.every((event) => event.lineType === 'info')).toBe(true);
    expect(result.unmatchedContentData).toHaveLength(1);
  });
});
