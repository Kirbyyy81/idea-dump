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

function confidenceFromQueueDepth(depth: number): PairingConfidence {
  if (depth <= 0) return 'unknown';
  if (depth === 1) return 'high';
  if (depth === 2) return 'medium';
  return 'low';
}

function txId(i: number): string {
  return `tx_${i}`;
}

function pairingKey(event: LogEvent): string | undefined {
  return event.endpointKey ?? event.url;
}

function appendLineRef(tx: Transaction, event: LogEvent) {
  if (!tx.lineRefs.includes(event.lineNumber)) {
    tx.lineRefs.push(event.lineNumber);
    tx.lineRefs.sort((a, b) => a - b);
  }
}

function contentDataMatches(contentData: LogEvent, request: LogEvent): boolean {
  const functionName = contentData.functionName?.toLowerCase();
  const target = [
    request.endpointKey,
    request.url,
    request.rawLine,
    request.bodyRaw,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (functionName && target.includes(functionName)) return true;
  if (contentData.endpointKey && contentData.endpointKey === request.endpointKey) return true;
  return !functionName && request.lineNumber - contentData.lineNumber <= 3;
}

function takeMatchingContentData(pending: LogEvent[], request: LogEvent): LogEvent | undefined {
  const index = pending.findLastIndex((event) => {
    if (request.lineNumber - event.lineNumber > 3) return false;
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

  if (errorCode != null && errorCode !== '' && errorCode !== 0 && errorCode !== '0') return true;
  if (typeof errorMessage === 'string' && errorMessage.trim()) return true;
  if (typeof displayErrorMessage === 'string' && displayErrorMessage.trim()) return true;
  if (typeof result === 'string' && result.toLowerCase() === 'fail') return true;
  if (responseCode != null && responseCode !== 0 && responseCode !== '0') return true;

  return Object.values(record).some((item) => hasFailurePayload(item));
}

function eventHasError(event: LogEvent): boolean {
  if (event.lineType === 'crash') return true;
  const t = `${event.eventType} ${event.rawLine}`.toUpperCase();
  if (t.includes('ERROR')) return true;
  if (event.httpStatus != null && (event.httpStatus < 200 || event.httpStatus > 299)) return true;
  return hasFailurePayload(event.bodyJson);
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
  const openByEndpoint = new Map<string, Transaction[]>();
  const transactions: Transaction[] = [];
  const orphanResponses: Transaction[] = [];
  const pendingContentData: LogEvent[] = [];
  const unparsedLines: UnparsedLogLine[] = [];

  let txCounter = 0;

  function closeIfTimedOut(currentMs: number | undefined) {
    if (currentMs == null || inactivityTimeoutMs === 0) return;

    for (const [key, queue] of Array.from(openByEndpoint.entries())) {
      while (queue.length > 0) {
        const tx = queue[0];
        const lastMs = tx.endedAtMs ?? tx.startedAtMs;
        if (lastMs == null) break;

        if (currentMs - lastMs > inactivityTimeoutMs) {
          tx.closedReason = 'timeout';
          tx.orphanKind = tx.responses.length === 0 ? 'request' : null;
          queue.shift();
        } else {
          break;
        }
      }

      if (queue.length === 0) openByEndpoint.delete(key);
    }
  }

  for (const event of events) {
    closeIfTimedOut(event.timestampMs);

    if (event.lineType === 'content_data') {
      pendingContentData.push(event);
      continue;
    }

    if (event.lineType === 'crash') {
      const tx: Transaction = {
        id: txId(++txCounter),
        endpointKey: event.endpointKey,
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
      transactions.push(tx);
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

    const key = pairingKey(event);
    if (isRequest(event) && key) {
      const queue = openByEndpoint.get(key) ?? [];
      const contentData = takeMatchingContentData(pendingContentData, event);

      const tx: Transaction = {
        id: txId(++txCounter),
        url: event.url,
        endpointKey: event.endpointKey,
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

      queue.push(tx);
      openByEndpoint.set(key, queue);
      transactions.push(tx);
      continue;
    }

    if (isResponseLike(event) && key) {
      const queue = openByEndpoint.get(key) ?? [];
      if (queue.length === 0) {
        const orphan: Transaction = {
          id: txId(++txCounter),
          url: event.url,
          endpointKey: event.endpointKey,
          responses: [event],
          lineRefs: [event.lineNumber],
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

      const tx = queue[0];
      tx.hadConcurrency ||= queue.length > 1;
      tx.responses.push(event);
      appendLineRef(tx, event);
      tx.endedAtMs = event.timestampMs ?? tx.endedAtMs;
      tx.orphanKind = null;
      tx.closedReason = 'paired';
      tx.confidence =
        tx.responses.length === 1
          ? confidenceFromQueueDepth(queue.length)
          : tx.confidence;
      queue.shift();
      if (queue.length === 0) openByEndpoint.delete(key);
      continue;
    }

    unparsedLines.push({
      rawLine: event.rawLine,
      lineNumber: event.lineNumber,
      reason: event.lineType === 'request' || event.lineType === 'response'
        ? 'Missing URL or endpoint key'
        : 'Unrecognized line type',
    });
  }

  // Close remaining at EOF
  const eofMs = options.nowMs;
  closeIfTimedOut(eofMs);

  for (const queue of Array.from(openByEndpoint.values())) {
    for (const tx of queue) {
      tx.closedReason = tx.closedReason ?? 'eof';
      tx.orphanKind = tx.responses.length === 0 ? 'request' : null;
    }
  }

  return {
    transactions,
    orphanResponses,
    unparsedLines,
    unmatchedContentData: pendingContentData,
  };
}

export function transactionHasError(tx: Transaction): boolean {
  if (tx.contentData && eventHasError(tx.contentData)) return true;
  if (tx.request && eventHasError(tx.request)) return true;
  return tx.responses.some((event) => eventHasError(event));
}
