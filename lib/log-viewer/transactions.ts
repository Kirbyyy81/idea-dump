import type { BuildTransactionsOptions, LogEvent, PairingConfidence, Transaction, UnparsedLogLine } from '@/lib/types';
import { appendLineRef, attachContent, endpointKeys, eventIds, isImageResult, isImageUpload, responseContentRequest, sourceScope } from './matching';

function preferredCorrelationId(event: LogEvent): string | undefined {
  return event.responseId ?? event.requestId ?? event.clientRequestId;
}

function sortTransactionsByTimeline(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => Math.min(...a.lineRefs) - Math.min(...b.lineRefs));
}

function hasFailurePayload(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some((item) => hasFailurePayload(item));
  }

  const record = value as Record<string, unknown>;
  const errorCode = record.errorCode;
  const errorMessage = record.errorMessage;
  const displayErrorMessage = record.displayErrorMessage;
  const result = record.result;
  const responseCode = record.responseCode;
  const responseStatus = record.responseStatus;
  const status = record.status;

  if (errorCode != null && errorCode !== '' && errorCode !== 0 && errorCode !== '0' && errorCode !== '00') return true;
  if (typeof errorMessage === 'string' && errorMessage.trim()) return true;
  if (typeof displayErrorMessage === 'string' && displayErrorMessage.trim()) return true;
  if (typeof result === 'string' && result.toLowerCase() === 'fail') return true;
  if (typeof status === 'string' && status.toLowerCase() === 'error') return true;
  if (responseCode != null && responseCode !== 0 && responseCode !== '0') return true;
  if (responseStatus && hasFailurePayload(responseStatus)) return true;

  return Object.values(record).some((item) => hasFailurePayload(item));
}

function eventHasError(event: LogEvent): boolean {
  if (event.lineType === 'crash' || event.lineType === 'error') return true;
  const t = event.eventType.toUpperCase();
  if (t.includes('ERROR')) return true;
  if (event.httpStatus != null && (event.httpStatus < 200 || event.httpStatus > 299)) return true;
  return hasFailurePayload(event.bodyJson);
}

function createTransaction(event: LogEvent, counter: number): Transaction {
  const request = event.lineType === 'request';
  const standalone = ['crash', 'error', 'info'].includes(event.lineType);
  return {
    id: 'tx_' + counter,
    url: event.url, endpointKey: event.endpointKey, host: event.host, path: event.path,
    correlationId: preferredCorrelationId(event), method: event.method,
    request: request ? event : undefined, responses: request ? [] : [event],
    lineRefs: [...new Set([event.lineNumber, event.endLineNumber ?? event.lineNumber])],
    orphanKind: standalone ? null : request ? 'request' : 'response',
    orphanResponse: !request && !standalone,
    startedAtMs: event.timestampMs, endedAtMs: event.timestampMs,
    confidence: standalone ? 'high' : 'unknown', hadConcurrency: false,
    closedReason: standalone ? 'paired' : request ? undefined : 'orphan',
  };
}

export function buildTransactions(events: LogEvent[], options: BuildTransactionsOptions): {
  transactions: Transaction[];
  orphanResponses: Transaction[];
  unparsedLines: UnparsedLogLine[];
  unmatchedContentData: LogEvent[];
} {
  const timeout = Math.max(0, options.inactivityTimeoutMs);
  const keys = endpointKeys(events);
  const open = new Set<Transaction>();
  const transactions: Transaction[] = [];
  const orphanResponses: Transaction[] = [];
  const unparsedLines: UnparsedLogLine[] = [];
  let counter = 0;

  function closeTimedOut(now?: number) {
    if (now == null || !timeout) return;
    for (const tx of open) {
      if (tx.startedAtMs != null && now - tx.startedAtMs > timeout) {
        tx.closedReason = 'timeout';
        open.delete(tx);
      }
    }
  }

  for (const event of events) {
    closeTimedOut(event.timestampMs);
    if (event.lineType === 'content_data') continue;
    if (event.lineType === 'other') {
      unparsedLines.push({ rawLine: event.rawLine, lineNumber: event.lineNumber, reason: 'Unrecognized line type' });
      continue;
    }
    if (['crash', 'error', 'info'].includes(event.lineType)) {
      transactions.push(createTransaction(event, ++counter));
      continue;
    }
    const key = keys.get(event);
    if (event.lineType === 'request') {
      if (!key && !eventIds(event).length) {
        unparsedLines.push({ rawLine: event.rawLine, lineNumber: event.lineNumber,
          reason: 'Missing URL, endpoint name, or correlation id' });
        continue;
      }
      const tx = createTransaction(event, ++counter);
      const concurrent = key ? [...open].filter((item) => keys.get(item.request!) === key) : [];
      if (concurrent.length) {
        tx.hadConcurrency = true;
        concurrent.forEach((item) => { item.hadConcurrency = true; });
      }
      transactions.push(tx);
      open.add(tx);
      continue;
    }

    const scoped = [...open].filter((tx) => sourceScope(tx.request!) === sourceScope(event));
    const ids = eventIds(event);
    const byId = scoped.filter((tx) => ids.some((id) => eventIds(tx.request!).includes(id)));
    let tx: Transaction | undefined = byId.length === 1 ? byId[0] : undefined;
    let confidence: PairingConfidence = tx ? 'high' : 'unknown';
    if (!tx) {
      const bridged = responseContentRequest(event, scoped, events);
      if (bridged) {
        tx = bridged.tx;
        confidence = bridged.confidence;
      }
    }
    if (!tx && key) {
      const queue = scoped.filter((item) => keys.get(item.request!) === key);
      tx = queue[0];
      if (tx) confidence = queue.length === 1 ? 'medium' : 'low';
    }
    if (!tx && !key) {
      const compatible = isImageResult(event)
        ? scoped.filter((item) => isImageUpload(item.request!))
        : event.source === 'unknown' || !event.source ? scoped : [];
      if (compatible.length === 1) {
        tx = compatible[0];
        confidence = 'low';
      }
    }
    if (tx) {
      tx.responses.push(event);
      appendLineRef(tx, event);
      tx.endedAtMs = event.timestampMs ?? tx.endedAtMs;
      tx.orphanKind = null;
      tx.closedReason = 'paired';
      tx.confidence = confidence;
      tx.url ??= event.url;
      tx.host ??= event.host;
      tx.path ??= event.path;
      // Prefer the actual URL path for a bare-name request once its response supplies one.
      if (event.path && !tx.request?.path) tx.endpointKey = event.endpointKey;
      tx.correlationId ??= preferredCorrelationId(event);
      open.delete(tx);
    } else {
      const orphan = createTransaction(event, ++counter);
      transactions.push(orphan);
      orphanResponses.push(orphan);
    }
  }

  closeTimedOut(options.nowMs);
  for (const tx of open) tx.closedReason = 'eof';
  const unmatchedContentData = attachContent(events, transactions);
  return {
    transactions: sortTransactionsByTimeline(transactions),
    orphanResponses: sortTransactionsByTimeline(orphanResponses),
    unparsedLines, unmatchedContentData,
  };
}

export function transactionHasError(tx: Transaction): boolean {
  if (tx.contentData && eventHasError(tx.contentData)) return true;
  if (tx.request && eventHasError(tx.request)) return true;
  return tx.responses.some(eventHasError);
}
