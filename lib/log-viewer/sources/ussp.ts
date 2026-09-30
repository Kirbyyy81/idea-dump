import type { LogLineType, LogViewerRecord } from '@/lib/types';
import { parseGenericRecord } from './generic';

export function parseUsspRecord(rest: string, lineType: LogLineType, url?: string): LogViewerRecord {
  const envelope = rest.match(/\bResponse\{protocol=[^}]*\bcode=(\d{3})[^}]*\}/);
  if (lineType === 'response' && envelope?.index != null) {
    return {
      httpStatus: Number(envelope[1]),
      bodyText: rest.slice(envelope.index + envelope[0].length).trim(),
    };
  }
  return parseGenericRecord(rest, lineType, url);
}
