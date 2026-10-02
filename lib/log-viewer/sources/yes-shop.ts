import type { LogLineType, LogViewerRecord } from '@/lib/types';
import { parseGenericRecord } from './generic';

export function parseYesShopRecord(rest: string, lineType: LogLineType, url?: string): LogViewerRecord {
  const record = parseGenericRecord(rest, lineType, url);
  if (!url && (lineType === 'request' || lineType === 'response')) {
    const match = rest.match(/^(?:REQUEST|RESPONSE[\s_]*(?:SUCCESS\d*|ERROR\d*)?)\s*>+\s*([a-z][a-z0-9_]*)\s*>+/i);
    if (match) {
      record.endpointName = match[1];
      record.bodyText = rest.slice(match[0].length).trim();
    }
  }
  return record;
}
