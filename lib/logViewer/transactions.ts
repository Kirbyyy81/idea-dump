import {
  BuildTransactionsOptions,
  LogEvent,
  PairingConfidence,
  Transaction,
  UnparsedLogLine,
} from '@/lib/logViewer/types';

function isRequest(event: LogEvent): boolean {
  return event.lineType === 'request';
}

function isResponseLike(event: LogEvent): boolean {
  return event.lineType === 'response';
}

function isStandaloneTimelineEvent(event: LogEvent): boolean {
  return event.lineType === 'crash' || event.lineType === 'error' || event.lineType === 'info';
}

function confidenceFromQueueDepth(depth: number): PairingConfidence {
  if (depth <= 0) return 'unknown';
  if (depth === 1) return 'medium';
  if (depth === 2) return 'low';
  return 'low';
}

function txId(i: number): string {
  return `tx_${i}`;
}

function eventIds(event: LogEvent): string[] {
  return Array.from(new Set([
    event.requestId,
    event.responseId,
    event.clientRequestId,
  ].filter((value): value is string => Boolean(value))));
}

function preferredCorrelationId(event: LogEvent): string | undefined {
  return event.responseId ?? event.requestId ?? event.clientRequestId;
}

function endpointPairingKey(event: LogEvent): string | undefined {
  if (event.host && event.path) return `${event.host}${event.path}`;
  return event.endpointKey ?? event.url;
}

function appendLineRef(tx: Transaction, event: LogEvent) {
  if (!tx.lineRefs.includes(event.lineNumber)) {
    tx.lineRefs.push(event.lineNumber);
  }

  if (event.endLineNumber && !tx.lineRefs.includes(event.endLineNumber)) {
    tx.lineRefs.push(event.endLineNumber);
  }

  tx.lineRefs.sort((a, b) => a - b);
}

function firstLineRef(tx: Transaction): number {
  return tx.lineRefs.length > 0 ? Math.min(...tx.lineRefs) : Number.MAX_SAFE_INTEGER;
}

function sortTransactionsByTimeline(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => firstLineRef(a) - firstLineRef(b));
}

function getOpenEntries(openByEndpoint: Map<string, Transaction[]>): Array<{
  key: string;
  tx: Transaction;
}> {
  const entries: Array<{ key: string; tx: Transaction }> = [];

  for (const [key, queue] of Array.from(openByEndpoint.entries())) {
    for (const tx of queue) entries.push({ key, tx });
  }

  return entries;
}

function registerOpenTransaction(
  tx: Transaction,
  request: LogEvent,
  openById: Map<string, Transaction>,
  openByEndpoint: Map<string, Transaction[]>,
) {
  for (const id of eventIds(request)) {
    openById.set(id, tx);
  }

  const key = endpointPairingKey(request);
  if (!key) return;

  const queue = openByEndpoint.get(key) ?? [];
  queue.push(tx);
  openByEndpoint.set(key, queue);
}

function unregisterOpenTransaction(
  tx: Transaction,
  openById: Map<string, Transaction>,
  openByEndpoint: Map<string, Transaction[]>,
) {
  for (const [id, openTx] of Array.from(openById.entries())) {
    if (openTx === tx) openById.delete(id);
  }

  for (const [key, queue] of Array.from(openByEndpoint.entries())) {
    const index = queue.indexOf(tx);
    if (index >= 0) queue.splice(index, 1);
    if (queue.length === 0) openByEndpoint.delete(key);
  }
}

function pairResponseToTransaction(
  tx: Transaction,
  event: LogEvent,
  confidence: PairingConfidence,
) {
  tx.responses.push(event);
  appendLineRef(tx, event);
  tx.endedAtMs = event.timestampMs ?? tx.endedAtMs;
  tx.orphanKind = null;
  tx.closedReason = 'paired';
  tx.confidence = tx.responses.length === 1 ? confidence : tx.confidence;
  tx.url = tx.url ?? event.url;
  tx.endpointKey = tx.endpointKey ?? event.endpointKey;
  tx.host = tx.host ?? event.host;
  tx.path = tx.path ?? event.path;
  tx.correlationId = tx.correlationId ?? preferredCorrelationId(event);
}

function contentDataMatches(contentData: LogEvent, request: LogEvent): boolean {
  const contentIds = eventIds(contentData);
  const requestIds = eventIds(request);
  if (contentIds.some((id) => requestIds.includes(id))) return true;

  const functionName = contentData.functionName?.toLowerCase();
  const target = [
    request.endpointKey,
    request.path,
    request.url,
    request.rawLine,
    request.bodyRaw,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (functionName && target.includes(functionName)) return true;
  if (request.lineNumber > contentData.lineNumber && request.lineNumber - contentData.lineNumber <= 3) return true;
  if (!functionName && request.lineNumber - contentData.lineNumber <= 10) return true;
  return false;
}

function takeMatchingContentData(pending: LogEvent[], request: LogEvent): LogEvent | undefined {
  const idMatchIndex = pending.findLastIndex((event) => {
    const contentIds = eventIds(event);
    const requestIds = eventIds(request);
    return contentIds.some((id) => requestIds.includes(id));
  });

  if (idMatchIndex >= 0) {
    const [event] = pending.splice(idMatchIndex, 1);
    return event;
  }

  const index = pending.findLastIndex((event) => {
    if (request.lineNumber - event.lineNumber > 10) return false;
    return contentDataMatches(event, request);
  });

  if (index < 0) return undefined;
  const [event] = pending.splice(index, 1);
  return event;
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

function createStandaloneTransaction(event: LogEvent, id: string): Transaction {
  return {
    id,
    url: event.url,
    endpointKey: event.endpointKey,
    host: event.host,
    path: event.path,
    correlationId: preferredCorrelationId(event),
    method: event.method,
    responses: [event],
    lineRefs: event.endLineNumber
      ? [event.lineNumber, event.endLineNumber]
      : [event.lineNumber],
    orphanKind: null,
    orphanResponse: false,
    startedAtMs: event.timestampMs,
    endedAtMs: event.timestampMs,
    confidence: 'high',
    hadConcurrency: false,
    closedReason: 'paired',
  };
}

export function buildTransactions(
  events: LogEvent[],
  options: BuildTransactionsOptions,
): {
  transactions: Transaction[];
  orphanResponses: Transaction[];
  unparsedLines: UnparsedLogLine[];
  unmatchedContentData: LogEvent[];
} {
  const inactivityTimeoutMs = Math.max(0, options.inactivityTimeoutMs);
  const openById = new Map<string, Transaction>();
  const openByEndpoint = new Map<string, Transaction[]>();
  const transactions: Transaction[] = [];
  const orphanResponses: Transaction[] = [];
  const pendingContentData: LogEvent[] = [];
  const unparsedLines: UnparsedLogLine[] = [];

  let txCounter = 0;

  function closeIfTimedOut(currentMs: number | undefined) {
    if (currentMs == null || inactivityTimeoutMs === 0) return;

    for (const queue of Array.from(openByEndpoint.values())) {
      for (const tx of [...queue]) {
        const lastMs = tx.endedAtMs ?? tx.startedAtMs;
        if (lastMs != null && currentMs - lastMs > inactivityTimeoutMs) {
          tx.closedReason = 'timeout';
          tx.orphanKind = tx.responses.length === 0 ? 'request' : null;
          unregisterOpenTransaction(tx, openById, openByEndpoint);
        }
      }
    }
  }

  for (const event of events) {
    closeIfTimedOut(event.timestampMs);

    if (event.lineType === 'content_data') {
      pendingContentData.push(event);
      continue;
    }

    if (isStandaloneTimelineEvent(event)) {
      transactions.push(createStandaloneTransaction(event, txId(++txCounter)));
      continue;
    }

    if (event.lineType === 'other') {
      unparsedLines.push({
        rawLine: event.rawLine,
        lineNumber: event.lineNumber,
        reason: 'Unrecognized line type',
      });
      continue;
    }

    if (isRequest(event)) {
      const key = endpointPairingKey(event);
      if (!key && eventIds(event).length === 0) {
        unparsedLines.push({
          rawLine: event.rawLine,
          lineNumber: event.lineNumber,
          reason: 'Missing URL, endpoint key, or correlation id',
        });
        continue;
      }

      const queue = key ? openByEndpoint.get(key) ?? [] : [];
      const contentData = takeMatchingContentData(pendingContentData, event);
      const tx: Transaction = {
        id: txId(++txCounter),
        url: event.url,
        endpointKey: event.endpointKey,
        host: event.host,
        path: event.path,
        correlationId: preferredCorrelationId(event),
        method: event.method,
        request: event,
        responses: [],
        contentData,
        lineRefs: contentData ? [contentData.lineNumber, event.lineNumber] : [event.lineNumber],
        orphanKind: 'request',
        orphanResponse: false,
        startedAtMs: event.timestampMs,
        endedAtMs: event.timestampMs,
        confidence: 'unknown',
        hadConcurrency: queue.length > 0,
      };

      registerOpenTransaction(tx, event, openById, openByEndpoint);
      transactions.push(tx);
      continue;
    }

    if (isResponseLike(event)) {
      let tx: Transaction | undefined;
      let confidence: PairingConfidence = 'unknown';

      for (const id of eventIds(event)) {
        tx = openById.get(id);
        if (tx) {
          confidence = 'high';
          break;
        }
      }

      const key = endpointPairingKey(event);
      if (!tx && key) {
        const queue = openByEndpoint.get(key) ?? [];
        tx = queue[0];
        confidence = confidenceFromQueueDepth(queue.length);
        if (tx) tx.hadConcurrency ||= queue.length > 1;
      }

      if (!tx && !key) {
        const openEntries = getOpenEntries(openByEndpoint);
        if (openEntries.length === 1) {
          tx = openEntries[0].tx;
          confidence = 'low';
        }
      }

      if (tx) {
        pairResponseToTransaction(tx, event, confidence);
        unregisterOpenTransaction(tx, openById, openByEndpoint);
        continue;
      }

      const orphan: Transaction = {
        id: txId(++txCounter),
        url: event.url,
        endpointKey: event.endpointKey,
        host: event.host,
        path: event.path,
        correlationId: preferredCorrelationId(event),
        method: event.method,
        responses: [event],
        lineRefs: event.endLineNumber ? [event.lineNumber, event.endLineNumber] : [event.lineNumber],
        orphanKind: 'response',
        orphanResponse: true,
        startedAtMs: event.timestampMs,
        endedAtMs: event.timestampMs,
        confidence: 'unknown',
        hadConcurrency: false,
        closedReason: 'orphan',
      };
      orphanResponses.push(orphan);
      transactions.push(orphan);
      continue;
    }

    unparsedLines.push({
      rawLine: event.rawLine,
      lineNumber: event.lineNumber,
      reason: 'Unrecognized line type',
    });
  }

  closeIfTimedOut(options.nowMs);

  for (const tx of Array.from(new Set(getOpenEntries(openByEndpoint).map((entry) => entry.tx)))) {
    tx.closedReason = tx.closedReason ?? 'eof';
    tx.orphanKind = tx.responses.length === 0 ? 'request' : null;
  }

  return {
    transactions: sortTransactionsByTimeline(transactions),
    orphanResponses: sortTransactionsByTimeline(orphanResponses),
    unparsedLines,
    unmatchedContentData: pendingContentData,
  };
}

export function transactionHasError(tx: Transaction): boolean {
  if (tx.contentData && eventHasError(tx.contentData)) return true;
  if (tx.request && eventHasError(tx.request)) return true;
  return tx.responses.some((event) => eventHasError(event));
}
