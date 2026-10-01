import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.unstubAllGlobals());

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

  it('folds nested objects and arrays independently and restores their formatting', () => {
    const { container } = render(<JsonOrText title="Request body" event={event} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request body' }));
    const itemsPath = '$["nested"]["items"]';
    fireEvent.click(screen.getByRole('button', { name: 'Collapse ' + itemsPath }));
    expect(container.querySelector('code')?.textContent).toBe('{\n  "nested": {\n    "items": […]\n  }\n}');
    const collapsed = screen.getByRole('button', { name: 'Expand ' + itemsPath });
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(collapsed.getAttribute('aria-controls')!)?.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse $["nested"]' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand $["nested"]' }));
    expect(screen.getByRole('button', { name: 'Expand ' + itemsPath })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Expand ' + itemsPath }));
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(payload, null, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(container.querySelector('code')?.textContent).toBe('{…}');
    fireEvent.click(screen.getByRole('button', { name: 'Expand $' }));
    expect(container.querySelector('code')?.textContent).toBe('{\n  "nested": {…}\n}');
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(payload, null, 2));
  });

  it('preserves commas, empty containers, special keys and independent sibling paths', () => {
    const value = { '': [{ 'a.b': { child: 1 } }, { 'a.b': { child: 2 } }], 'quote"': {}, array: [] };
    const { container } = render(<JsonOrText title="Payload" event={{ ...event, bodyJson: value }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Payload' }));
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(value, null, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse $[""][0]' }));
    expect(container.querySelector('code')?.textContent).toContain('    {…},\n    {');
    expect(container.querySelector('code')?.textContent).toContain('"child": 2');
    fireEvent.click(screen.getByRole('button', { name: 'Expand $[""][0]' }));
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(value, null, 2));
  });

  it('copies complete JSON from a closed panel and from folded content', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(<JsonOrText title="Request body" event={event} />);
    const copy = screen.getByRole('button', { name: 'Copy request JSON' });
    expect(copy.textContent).toBe('');
    expect(copy.querySelector('svg')).not.toBeNull();
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('JSON copied.'));
    expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(payload, null, 2));
    expect(container.querySelector('pre')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Raw request line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(payload, null, 2));
    expect(container.querySelector('code')?.textContent).toBe('{…}');
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('keeps request and response copying and folding independent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<><JsonOrText title="Request body" event={event} /><JsonOrText title="Response body" event={{ ...event, lineType: 'response', bodyJson: { ok: true } }} /></>);
    const request = within(screen.getByRole('region', { name: 'Request body' }));
    const response = within(screen.getByRole('region', { name: 'Response body' }));
    fireEvent.click(request.getByRole('button', { name: 'Request body' }));
    fireEvent.click(request.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(response.getByRole('button', { name: 'Response body' }));
    expect(response.getByRole('button', { name: 'Collapse $' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(response.getByRole('button', { name: 'Copy response JSON' }));
    await waitFor(() => expect(response.getByRole('status').textContent).toBe('JSON copied.'));
    expect(writeText).toHaveBeenCalledWith('{\n  "ok": true\n}');
    expect(request.getByRole('status').textContent).toBe('');
    expect(request.getByRole('button', { name: 'Expand $' })).toBeDefined();
  });

  it('reports clipboard failures and allows retrying', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<JsonOrText title="Response body" event={{ ...event, lineType: 'response', bodyJson: null }} />);
    const copy = screen.getByRole('button', { name: 'Copy response JSON' });
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Could not copy JSON'));
    expect(copy.getAttribute('title')).toBe('Copy response JSON');
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('JSON copied.'));
    expect(writeText).toHaveBeenLastCalledWith('null');
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
    if (body.bodyKind !== 'json') expect(screen.queryByRole('button', { name: /Copy .* JSON/ })).toBeNull();
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
