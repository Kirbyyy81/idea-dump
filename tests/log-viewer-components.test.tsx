import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LogEvent } from '@/lib/types';
import { JsonOrText } from '@/app/log-viewer/_components/JsonTree';
import { TransactionRow } from '@/app/log-viewer/_components/TransactionDisplay';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions } from '@/lib/log-viewer/transactions';

const payload = { nested: { items: [{ more: { text: '<script>alert("test")</script>', escaped: 'quote " and slash \\ and newline\n', enabled: true, amount: -32.5, empty: null } }] } };
const event: LogEvent = {
  id: 'line_1', lineNumber: 1, timestamp: '', lineType: 'request', eventType: 'REQUEST',
  rawLine: 'REQUEST >>> https://example.test/api >>> ' + JSON.stringify(payload),
  bodyKind: 'json', bodyJson: payload,
};

describe('Log Viewer payload panels', () => {
  it('lazily renders fully expanded, escaped JSON with exact indentation', () => {
    const { container } = render(<JsonOrText title="Request body" event={event} />);
    expect(container.querySelector('pre')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request body' }));
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(payload, null, 2));
    expect(container.querySelectorAll('details')).toHaveLength(0);
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelector('.text-success')).not.toBeNull();
    expect(container.querySelector('.text-warning')).not.toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request body' }));
    expect(container.querySelector('pre')).toBeNull();
  });

  it('uses sibling buttons and reveals raw text without hiding the formatted payload', () => {
    const { container } = render(<JsonOrText title="Request body" event={event} />);
    const raw = screen.getByRole('button', { name: 'Raw request line' });
    const toggle = screen.getByRole('button', { name: 'Request body' });
    expect(raw.parentElement).toBe(toggle.parentElement);
    expect(raw.querySelector('button')).toBeNull();
    expect(document.getElementById(raw.getAttribute('aria-controls')!)).not.toBeNull();
    fireEvent.click(raw);
    expect(raw.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByRole('textbox', { name: 'Raw request line' }) as HTMLTextAreaElement).value).toBe(event.rawLine);
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(payload, null, 2));
    fireEvent.click(raw);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('code')).not.toBeNull();
  });

  it('keeps request and response raw visibility independent', () => {
    render(<><JsonOrText title="Request body" event={event} /><JsonOrText title="Response body" event={{ ...event, lineType: 'response' }} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Raw request line' }));
    const response = within(screen.getByRole('region', { name: 'Response body' }));
    expect(response.queryByRole('textbox')).toBeNull();
    expect(response.getByRole('button', { name: 'Response body' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(response.getByRole('button', { name: 'Raw response line' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it.each([
    [{ bodyKind: 'none' }, '(No Body)'],
    [{ bodyKind: 'json', bodyJson: null }, 'null'],
    [{ bodyKind: 'text', bodyRaw: 'connection reset' }, 'connection reset'],
    [{ bodyKind: 'text', bodyRaw: '{"broken":', bodyParseError: true }, '{"broken":'],
  ] as const)('renders empty and non-object payloads', (body, expected) => {
    const { container } = render(<JsonOrText title="Payload" event={{ ...event, ...body }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Payload' }));
    expect(container.querySelector('pre')?.textContent).toBe(expected);
    if ('bodyParseError' in body) expect(screen.getByText('JSON parse failed; showing extracted raw payload.')).toBeDefined();
  });

  it('shows content and response together with an honest missing-request status', () => {
    const parsed = parseLogText([
      '2026-09-24 10:00:00.000 CONTENT DATA >> getEkycUploadVideoContentData >> {}',
      '2026-09-24 10:00:00.001 RESPONSE https://example.test/ekyc/ws/v1/json/verifyImageWithVideo {}',
      '2026-09-24 10:00:00.002 REQUEST https://example.test/yesshop/mobile/ws/v1/json/Other {}',
    ].join('\n'));
    const tx = buildTransactions(parsed, { inactivityTimeoutMs: 0 }).transactions[0];
    render(<TransactionRow tx={tx} expanded onToggle={() => {}} />);
    expect(screen.getByText('Request not logged.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Content data payload' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Response body' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Request body' })).toBeNull();
  });
});
