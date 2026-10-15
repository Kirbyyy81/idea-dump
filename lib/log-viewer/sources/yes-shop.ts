import type { LogLineType, LogViewerRecord } from '@/lib/types';
import { parseGenericRecord } from './generic';

export function parseYesShopRecord(rest: string, lineType: LogLineType, url?: string): LogViewerRecord {
  if (lineType === 'content_data' && /^Postpaid Registration\s*>{2,}/i.test(rest)) {
    return { functionName: 'Postpaid Registration', bodyText: rest.replace(/^Postpaid Registration\s*>{2,}\s*/i, '') };
  }
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
