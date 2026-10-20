import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogTimeline } from '@/app/log-viewer/_components/LogTimeline';
import { StandaloneLines } from '@/app/log-viewer/_components/StandaloneLines';
import { TransactionRow } from '@/app/log-viewer/_components/TransactionDisplay';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions } from '@/lib/log-viewer/transactions';
import { groupUnparsedLines, timelineRows } from '@/lib/log-viewer/presentation';

describe('Log Viewer descending display', () => {
  it('reverses recorded blocks without sorting by unreliable timestamps or mutating correlation data', () => {
    const events = parseLogText([
      '2026-10-20 10:00:20.000 REQUEST https://example.test/ussp/v1/First {}',
      '2026-10-20 10:00:21.000 RESPONSE https://example.test/ussp/v1/First {}',
      '2026-10-20 10:00:10.000 EARLIER_MARKER >>> earlier',
      '2026-10-20 10:00:10.000 LATEST_MARKER >>> latest',
    ].join('\n'));
    const { transactions } = buildTransactions(events, { inactivityTimeoutMs: 0 });
    const rows = timelineRows(transactions, new Set(transactions.map(tx => tx.id)), false, events);
    const before = JSON.stringify({ events, transactions, rows });
    render(<LogTimeline rows={rows} transactions={transactions} selected={null} onSelect={vi.fn()} onNavigate={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual([
      expect.stringContaining('LATEST_MARKER'), expect.stringContaining('EARLIER_MARKER'), expect.stringContaining('/ussp/v1/First'),
    ]);
    expect(JSON.stringify({ events, transactions, rows })).toBe(before);
  });

  it('interleaves standalone and unparsed blocks newest first while keeping original raw text', () => {
    const events = parseLogText([
      '2026-10-20 10:00:00.000 REQUEST >>> (No Body)',
      '2026-10-20 10:00:01.000 CONTENT DATA >> older >> {}',
      '2026-10-20 10:00:02.000 REQUEST >>> (No Body)',
      '2026-10-20 10:00:03.000 CONTENT DATA >> newer >> {}',
    ].join('\n'));
    const result = buildTransactions(events, { inactivityTimeoutMs: 0 });
    const unparsed = groupUnparsedLines(result.unparsedLines);
    const before = JSON.stringify(result);
    const { container } = render(<StandaloneLines open unparsedLines={unparsed} unmatchedContentData={result.unmatchedContentData} />);
    const blocks = [...container.querySelector('details > div')!.children];
    expect(blocks.map(block => block.textContent)).toEqual([
      expect.stringContaining('newer'), expect.stringContaining('L3'), expect.stringContaining('older'), expect.stringContaining('L1'),
    ]);
    expect(screen.getByRole('textbox', { name: 'Unparsed lines 3-3' }).getAttribute('readonly')).not.toBeNull();
    expect(JSON.stringify(result)).toBe(before);
  });

  it('shows multiple associated responses newest first without changing their saved order', () => {
    const events = parseLogText([
      '2026-10-20 10:00:00.000 REQUEST https://example.test/ussp/v1/First {}',
      '2026-10-20 10:00:01.000 RESPONSE https://example.test/ussp/v1/First {"value":1}',
      '2026-10-20 10:00:02.000 RESPONSE https://example.test/ussp/v1/First {"value":2}',
    ].join('\n'));
    const tx = buildTransactions(events, { inactivityTimeoutMs: 0 }).transactions[0];
    tx.responses = events.slice(1);
    const before = JSON.stringify(tx);
    render(<TransactionRow tx={tx} expanded onToggle={vi.fn()} />);
    expect(screen.getAllByRole('region', { name: 'Response body' }).map(body => body.parentElement?.textContent)).toEqual([
      expect.stringContaining('10:00:02.000'), expect.stringContaining('10:00:01.000'),
    ]);
    expect(JSON.stringify(tx)).toBe(before);
  });
});
