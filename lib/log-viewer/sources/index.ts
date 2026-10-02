import type { LogEvent, LogViewerSource } from '@/lib/types';
import { parseGenericRecord } from './generic';
import { parseYesShopRecord } from './yes-shop';
import { parseUsspRecord } from './ussp';

export const sourceParsers = {
  'yes-shop': parseYesShopRecord,
  ussp: parseUsspRecord,
  unknown: parseGenericRecord,
};

export function sourceFromUrl(url?: string): LogViewerSource {
  if (!url) return 'unknown';
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.startsWith('/ussp/')) return 'ussp';
    if (/^\/(?:yesshop(?:-admin|-report|-wallet)?\/|cots\/api\/yes-shop\/)/.test(path)) return 'yes-shop';
  } catch { /* Preserve unrecognised URL text in the generic parser. */ }
  return 'unknown';
}

export function resolveSources(events: LogEvent[]): LogViewerSource[] {
  const explicit = events.map((event) => sourceFromUrl(event.url));
  const sources = new Set(explicit.filter((source) => source !== 'unknown'));
  if (sources.size === 1) {
    const source = [...sources][0];
    return explicit.map(() => source);
  }
  // In mixed input, inherit only when both surrounding URL anchors agree.
  const next: LogViewerSource[] = [];
  let following: LogViewerSource = 'unknown';
  for (let i = events.length - 1; i >= 0; i -= 1) {
    next[i] = following;
    if (explicit[i] !== 'unknown') following = explicit[i];
  }
  let previous: LogViewerSource = 'unknown';
  return explicit.map((source, i) => {
    if (source !== 'unknown') {
      previous = source;
      return source;
    }
    return previous !== 'unknown' && previous === next[i] ? previous : 'unknown';
  });
}
