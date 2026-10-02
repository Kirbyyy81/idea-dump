import type { LogContentMatch, LogEvent, Transaction } from '@/lib/types';
import { contentEndpoints, normalizeLogName } from './dictionary';

export function eventIds(event: LogEvent): string[] {
  return [...new Set([event.requestId, event.responseId, event.clientRequestId]
    .filter((value): value is string => Boolean(value)))];
}

export function sourceScope(event: LogEvent): string {
  return `${event.source ?? 'unknown'}:${event.sourceSegment ?? 0}`;
}

export function endpointName(event: LogEvent): string {
  return normalizeLogName(event.endpointName ?? event.path?.split('/').filter(Boolean).at(-1) ?? '');
}

export function endpointKeys(events: LogEvent[]): Map<LogEvent, string> {
  const pathsByName = new Map<string, Set<string>>();
  const fullKey = (event: LogEvent) => `${sourceScope(event)}:${event.host ?? ''}:${(event.path ?? '').replace(/\/+$/, '')}`;
  for (const event of events) {
    if (!event.path) continue;
    const name = `${sourceScope(event)}:${endpointName(event)}`;
    const paths = pathsByName.get(name) ?? new Set();
    paths.add(fullKey(event));
    pathsByName.set(name, paths);
  }
  const keys = new Map<LogEvent, string>();
  for (const event of events) {
    if (event.path) keys.set(event, fullKey(event));
    else if (event.endpointName) {
      const name = `${sourceScope(event)}:${endpointName(event)}`;
      const paths = pathsByName.get(name);
      keys.set(event, paths?.size === 1 ? [...paths][0] : `${name}:bare`);
    } else if (event.url) keys.set(event, `${sourceScope(event)}:${event.url}`);
  }
  return keys;
}

export function appendLineRef(tx: Transaction, event: LogEvent) {
  tx.lineRefs = [...new Set([...tx.lineRefs, event.lineNumber, event.endLineNumber ?? event.lineNumber])]
    .sort((a, b) => a - b);
}

export function isImageResult(event: LogEvent): boolean {
  if (event.source !== 'yes-shop' || !/\bRESULT\b/i.test(event.eventType)) return false;
  const body = event.bodyJson;
  return Boolean(body && typeof body === 'object' && 'imageId' in body && 'id_expected_confidence' in body);
}

export function isImageUpload(event: LogEvent): boolean {
  return event.source === 'yes-shop' && ['uploadmykadimage', 'uploadpassportimage'].includes(endpointName(event));
}

function acceptsUnnamedContent(tx: Transaction): boolean {
  if (!tx.request) return true;
  const body = tx.request.bodyJson;
  return Boolean(body && typeof body === 'object' && 'contentData' in body && body.contentData != null);
}

export function responseContentRequest(
  response: LogEvent, open: Transaction[], events: LogEvent[],
): { tx: Transaction; confidence: 'medium' | 'low' } | undefined {
  const ids = eventIds(response);
  if (!ids.length) return undefined;
  const contents = events.filter((event) => event.lineType === 'content_data' &&
    sourceScope(event) === sourceScope(response) && event.lineNumber < response.lineNumber &&
    eventIds(event).some((id) => ids.includes(id)));
  if (contents.length !== 1) return undefined;
  const content = contents[0];
  const endpoints = contentEndpoints(content);
  const start = events.indexOf(content);
  const candidates = open.filter((tx) => {
    const index = events.indexOf(tx.request!);
    if (index <= start || index - start > 10) return false;
    if (endpoints.length) {
      if (!endpoints.includes(endpointName(tx.request!))) return false;
    } else if (content.source !== 'ussp' || !acceptsUnnamedContent(tx)) return false;
    // The response endpoint can disambiguate concurrent encrypted requests.
    if (response.endpointName && endpointName(response) !== endpointName(tx.request!)) return false;
    if (response.host && tx.request?.host && response.host !== tx.request.host) return false;
    if (response.path && tx.request?.path && response.path.replace(/\/+$/, '') !== tx.request.path.replace(/\/+$/, '')) return false;
    return !events.slice(start + 1, index).some((event) => event.lineType === 'content_data' &&
      sourceScope(event) === sourceScope(content) && (endpoints.length === 0 ||
        contentEndpoints(event).some((name) => endpoints.includes(name))));
  });
  return candidates.length === 1 ? { tx: candidates[0], confidence: endpoints.length ? 'medium' : 'low' } : undefined;
}

export function attachContent(events: LogEvent[], transactions: Transaction[]): LogEvent[] {
  const pending = new Set(events.filter((event) => event.lineType === 'content_data'));
  const positions = new Map(events.map((event, index) => [event, index]));
  const rules = new Map([...pending].map((event) => [event, contentEndpoints(event)]));
  const candidates = transactions.filter((tx) => tx.request || tx.responses[0]?.lineType === 'response');
  const anchor = (tx: Transaction) => tx.request ?? tx.responses[0];
  const txEvents = (tx: Transaction) => tx.request ? [tx.request, ...tx.responses] : tx.responses;
  const matchesRule = (content: LogEvent, tx: Transaction) => (rules.get(content) ?? []).includes(endpointName(anchor(tx)));

  function nearby(content: LogEvent, tx: Transaction, proximity: boolean): boolean {
    const start = positions.get(content)!;
    const end = positions.get(anchor(tx))!;
    if (end <= start || end - start > 10) return false;
    // A later content record for the same endpoint starts a new matching window.
    return !events.slice(start + 1, end).some((event) => event.lineType === 'content_data' &&
      sourceScope(event) === sourceScope(content) && (proximity ||
        (rules.get(event) ?? []).some((name) => (rules.get(content) ?? []).includes(name))));
  }

  function eligible(content: LogEvent, tx: Transaction): boolean {
    return !tx.contentData && sourceScope(content) === sourceScope(anchor(tx)) &&
      positions.get(anchor(tx))! > positions.get(content)!;
  }

  function assign(method: LogContentMatch['method'], confidence: LogContentMatch['confidence']) {
    const proposals = new Map<LogEvent, Transaction>();
    const counts = new Map<Transaction, number>();
    for (const content of pending) {
      const ids = eventIds(content);
      const endpoints = rules.get(content) ?? [];
      // Conflicting or ambiguous ID evidence must not become a proximity match.
      if (method !== 'id' && candidates.some((tx) => sourceScope(anchor(tx)) === sourceScope(content) &&
        ids.some((id) => txEvents(tx).some((event) => eventIds(event).includes(id))))) continue;
      const matches = candidates.filter((tx) => {
        if (!eligible(content, tx)) return false;
        if (method === 'id') return ids.some((id) => txEvents(tx).some((event) => eventIds(event).includes(id)));
        if (!nearby(content, tx, method === 'proximity')) return false;
        if (method === 'dictionary') return endpoints.length > 0 && matchesRule(content, tx);
        if (content.source !== 'ussp' || content.functionName || endpoints.length > 0) return false;
        return acceptsUnnamedContent(tx);
      });
      if (matches.length !== 1) continue;
      proposals.set(content, matches[0]);
      counts.set(matches[0], (counts.get(matches[0]) ?? 0) + 1);
    }
    for (const [content, tx] of proposals) {
      if (counts.get(tx) !== 1) continue;
      tx.contentData = content;
      tx.contentMatch = { method, confidence };
      tx.correlationId ??= content.requestId ?? content.clientRequestId;
      appendLineRef(tx, content);
      pending.delete(content);
    }
  }

  assign('id', 'high');
  assign('dictionary', 'medium');
  assign('proximity', 'low');
  return [...pending];
}
