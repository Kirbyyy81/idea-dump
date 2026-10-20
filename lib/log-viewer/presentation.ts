import type { LogEvent, LogTimelineRow, LogViewerFilters, Transaction, UnparsedLogLine } from '@/lib/types';
import { sourceScope } from './matching';
import { eventHasError, transactionHasError } from './transactions';

export const sourceLabels = { 'yes-shop': 'Yes Shop', ussp: 'USSP', unknown: 'Unknown' };

export function transactionEvents(tx: Transaction): LogEvent[] {
  return [tx.request, tx.contentData, ...tx.responses].filter((event): event is LogEvent => Boolean(event));
}

export function eventMatches(event: LogEvent, filters: LogViewerFilters): boolean {
  return (!filters.source || (event.source ?? 'unknown') === filters.source)
    && (!filters.lineType || event.lineType === filters.lineType)
    && (!filters.endpoint || (event.endpointKey ?? event.functionName ?? event.url ?? '') === filters.endpoint)
    && (!filters.query.trim() || event.rawLine.toLowerCase().includes(filters.query.trim().toLowerCase()))
    && (!filters.errorsOnly || eventHasError(event))
    && (!filters.status || (filters.status === 'errors' && eventHasError(event)) || (filters.status === 'ok' && !eventHasError(event)));
}

export function transactionMatches(tx: Transaction, filters: LogViewerFilters): boolean {
  if (filters.section !== 'all') return false;
  const events = transactionEvents(tx);
  if (filters.source && !events.some(event => (event.source ?? 'unknown') === filters.source)) return false;
  if (filters.lineType && !events.some(event => event.lineType === filters.lineType)) return false;
  if (filters.endpoint && (tx.endpointKey ?? tx.url ?? '') !== filters.endpoint) return false;
  if ((filters.errorsOnly || filters.status === 'errors') && !transactionHasError(tx)) return false;
  if (filters.status === 'ok' && transactionHasError(tx)) return false;
  if (filters.status === 'orphans' && !tx.orphanKind) return false;
  if (filters.status === 'missing-response' && tx.orphanKind !== 'request') return false;
  if (filters.status === 'orphan-response' && tx.orphanKind !== 'response') return false;
  const query = filters.query.trim().toLowerCase();
  return !query || [tx.endpointKey, tx.url, ...events.map(event => event.rawLine)].some(text => text?.toLowerCase().includes(query));
}

export function groupUnparsedLines(lines: UnparsedLogLine[]): UnparsedLogLine[] {
  const blocks: UnparsedLogLine[] = [];
  for (const line of lines) {
    const previous = blocks.at(-1);
    if (previous && (previous.endLineNumber ?? previous.lineNumber) + 1 === line.lineNumber
      && previous.source === line.source && previous.sourceSegment === line.sourceSegment && previous.reason === line.reason && previous.lineType === line.lineType) {
      previous.rawLine += '\n' + line.rawLine;
      previous.endLineNumber = line.endLineNumber ?? line.lineNumber;
    } else blocks.push({ ...line });
  }
  return blocks;
}

export function unparsedMatches(line: UnparsedLogLine, filters: LogViewerFilters): boolean {
  return filters.section !== 'unmatched' && !filters.endpoint && !filters.errorsOnly && !filters.status
    && (!filters.lineType || filters.lineType === (line.lineType ?? 'other'))
    && (!filters.source || (line.source ?? 'unknown') === filters.source)
    && (!filters.query.trim() || line.rawLine.toLowerCase().includes(filters.query.trim().toLowerCase()));
}

function isAuthEvent(event: LogEvent): boolean {
  return /^(?:AUTH_|Auth Token |Refresh Token |App Version$)/i.test(event.eventType)
    || event.endpointName?.toLowerCase() === 'getappversion';
}

export function isAuthTransaction(tx: Transaction): boolean {
  const events = transactionEvents(tx);
  return events.length > 0 && events.every(isAuthEvent);
}

function isReaderEvent(event: LogEvent): boolean {
  return /^SECURE_METRIC_READER(?:_DATA)?$/i.test(event.eventType);
}

// Group before filtering so hidden business records remain group boundaries.
export function timelineRows(transactions: Transaction[], visible: Set<string>, groupAuth: boolean, events: LogEvent[] = []): LogTimelineRow[] {
  const barriers = new Map<number, number>();
  const readerBarriers = new Map<number, number>();
  let barrier = 0, readerBarrier = 0;
  for (const event of events) {
    if (!isAuthEvent(event)) barrier++;
    if (!isReaderEvent(event)) readerBarrier++;
    barriers.set(event.lineNumber, barrier);
    readerBarriers.set(event.lineNumber, readerBarrier);
  }
  const groups: LogTimelineRow[] = [];
  for (const tx of transactions) {
    const previous = groups.at(-1);
    const last = previous?.transactions.at(-1);
    const sameScope = last && sourceScope(transactionEvents(last)[0]) === sourceScope(transactionEvents(tx)[0]);
    const gap = last?.startedAtMs != null && tx.startedAtMs != null ? tx.startedAtMs - last.startedAtMs : undefined;
    const consecutive = last && barriers.get(last.lineRefs[0]) === barriers.get(tx.lineRefs[0]);
    const auth = groupAuth && isAuthTransaction(tx);
    const reader = !tx.request && !tx.contentData && tx.responses.length === 1 && isReaderEvent(tx.responses[0]);
    const consecutiveReader = last && readerBarriers.get(last.lineRefs[0]) === readerBarriers.get(tx.lineRefs[0]);
    if (reader && previous?.kind === 'reader' && sameScope && consecutiveReader) previous.transactions.push(tx);
    else if (auth && previous?.kind === 'auth' && sameScope && consecutive && gap != null && gap >= 0 && gap <= 30000) previous.transactions.push(tx);
    else groups.push({ kind: reader ? 'reader' : auth ? 'auth' : 'transaction', transactions: [tx] });
  }
  return groups.map(group => ({ ...group, transactions: group.transactions.filter(tx => visible.has(tx.id)) }))
    .filter(group => group.transactions.length > 0);
}

export function sessionContext(tx: Transaction, transactions: Transaction[]): Transaction[] {
  if (!transactionEvents(tx).some(event => event.httpStatus === 401)) return [];
  const anchor = transactionEvents(tx)[0];
  const index = transactions.indexOf(tx);
  return transactions.slice(Math.max(0, index - 12), index + 13).filter(candidate => {
    if (candidate === tx) return true;
    const event = transactionEvents(candidate)[0];
    if (sourceScope(event) !== sourceScope(anchor) || event.timestampMs == null || anchor.timestampMs == null
      || Math.abs(event.timestampMs - anchor.timestampMs) > 60000) return false;
    return isAuthTransaction(candidate) || event.endpointName?.toLowerCase() === 'login'
      || (candidate.endpointKey === tx.endpointKey && candidate.host === tx.host);
  });
}
