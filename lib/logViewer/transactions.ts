import {
  BuildTransactionsOptions,
  LogEvent,
  PairingConfidence,
  Transaction,
} from '@/lib/logViewer/types';

function isRequest(event: LogEvent): boolean {
  return event.eventType.toUpperCase() === 'REQUEST';
}

function isResponseLike(event: LogEvent): boolean {
  const t = event.eventType.toUpperCase();
  if (t === 'RESPONSE') return true;
  if (t.startsWith('RESPONSE')) return true;
  if (t.includes('UNKNOWN ERROR OCCURRED')) return true;
  if (t.includes('UNEXPECTED ERROR OCCURRED')) return true;
  return false;
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

export function buildTransactions(
  events: LogEvent[],
  options: BuildTransactionsOptions,
): {
  transactions: Transaction[];
  orphanResponses: Transaction[];
} {
  const inactivityTimeoutMs = Math.max(0, options.inactivityTimeoutMs);
  const openByUrl = new Map<string, Transaction[]>();
  const transactions: Transaction[] = [];
  const orphanResponses: Transaction[] = [];

  let txCounter = 0;

  function closeIfTimedOut(currentMs: number | undefined) {
    if (currentMs == null || inactivityTimeoutMs === 0) return;

    for (const [url, queue] of openByUrl.entries()) {
      while (queue.length > 0) {
        const tx = queue[0];
        const lastMs = tx.endedAtMs ?? tx.startedAtMs;
        if (lastMs == null) break;

        if (currentMs - lastMs > inactivityTimeoutMs) {
          tx.closedReason = 'timeout';
          queue.shift();
        } else {
          break;
        }
      }

      if (queue.length === 0) openByUrl.delete(url);
    }
  }

  for (const event of events) {
    closeIfTimedOut(event.timestampMs);

    const url = event.url;
    if (isRequest(event) && url) {
      const queue = openByUrl.get(url) ?? [];
      if (queue.length > 0) {
        const oldest = queue[0];
        if (oldest.responses.length > 0) {
          oldest.closedReason = 'next_request';
          queue.shift();
        }
      }

      const tx: Transaction = {
        id: txId(++txCounter),
        url,
        method: event.method,
        request: event,
        responses: [],
        orphanResponse: false,
        startedAtMs: event.timestampMs,
        endedAtMs: event.timestampMs,
        confidence: 'unknown',
        hadConcurrency: queue.length > 0,
      };

      queue.push(tx);
      openByUrl.set(url, queue);
      transactions.push(tx);
      continue;
    }

    if (isResponseLike(event) && url) {
      const queue = openByUrl.get(url) ?? [];
      if (queue.length === 0) {
        const orphan: Transaction = {
          id: txId(++txCounter),
          url,
          responses: [event],
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
      tx.endedAtMs = event.timestampMs ?? tx.endedAtMs;
      tx.confidence =
        tx.responses.length === 1
          ? confidenceFromQueueDepth(queue.length)
          : tx.confidence;

      // If this response is clearly an error, treat it as a logical end for many cases.
      // We still keep the transaction open for potential additional response lines,
      // until a new request arrives, timeout hits, or EOF closes it.
      continue;
    }

    // Unknown line types or missing URL: ignore for pairing, but still allow UX to show raw lines later if needed.
  }

  // Close remaining at EOF
  const eofMs = options.nowMs;
  closeIfTimedOut(eofMs);

  for (const queue of openByUrl.values()) {
    for (const tx of queue) {
      tx.closedReason = tx.closedReason ?? 'eof';
    }
  }

  return { transactions, orphanResponses };
}

export function transactionHasError(tx: Transaction): boolean {
  return tx.responses.some((r) => {
    const t = r.eventType.toUpperCase();
    if (t.includes('RESPONSE ERROR')) return true;
    if (t.includes('UNKNOWN ERROR OCCURRED')) return true;
    if (t.includes('UNEXPECTED ERROR OCCURRED')) return true;
    if (r.httpStatus != null && r.httpStatus >= 400) return true;
    return false;
  });
}
