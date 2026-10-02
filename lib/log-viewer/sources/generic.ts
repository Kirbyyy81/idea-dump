import type { LogLineType, LogViewerRecord } from '@/lib/types';

export function parseGenericRecord(rest: string, lineType: LogLineType, url?: string): LogViewerRecord {
  if (lineType === 'content_data') {
    const named = rest.match(/^CONTENT\s+DATA\s*>>\s*([^>]+?)\s*>>\s*([\s\S]*)$/i);
    return {
      functionName: named?.[1]?.trim(),
      bodyText: named?.[2] ?? rest.replace(/^JSON\s+DATA\s+STRING\s*-\s*/i, ''),
    };
  }
  if (lineType !== 'request' && lineType !== 'response') return { bodyText: rest };

  if (url) {
    const afterUrl = rest.slice(rest.indexOf(url) + url.length)
      .replace(/^[\s>]+/, '')
      .replace(/^(?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|\(\d{3}\))\s*>+\s*)+/i, '')
      .trim();
    return afterUrl && !/^\d+\s*ms\s*$/i.test(afterUrl) ? { bodyText: afterUrl } : {};
  }
  // Split only the header. Delimiters and URLs inside the payload are data.
  const jsonStart = rest.search(/[\[{]/);
  if (jsonStart >= 0) return { bodyText: rest.slice(jsonStart) };
  const parts = rest.split(/\s+>{2,}\s*/).map((part) => part.trim()).filter(Boolean);
  const tail = parts.at(-1) ?? '';
  if (tail === '(No Body)') return { bodyText: tail };
  if (parts.length > 1 && tail !== url && !/^(?:https?:\/\/|\(\d{3}\)|\d+\s*ms\b)/i.test(tail)) {
    return { bodyText: tail };
  }
  return {};
}
