import { LogBodyKind, LogEvent } from '@/lib/logViewer/types';

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

function tryParseTimestampMs(timestamp: string): number | undefined {
  // Expected: "YYYY-MM-DD HH:mm:ss.SSS"
  const isoish = timestamp.replace(' ', 'T');
  const parsed = Date.parse(isoish);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractJsonCandidate(text: string): string | undefined {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
        ? firstObj
        : Math.min(firstObj, firstArr);
  if (start === -1) return undefined;

  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end === -1 || end <= start) return undefined;

  return text.slice(start, end + 1).trim();
}

function parseBody(bodyText: string | undefined): {
  kind: LogBodyKind;
  raw?: string;
  json?: unknown;
} {
  if (!bodyText) return { kind: 'none' };
  const trimmed = bodyText.trim();
  if (!trimmed || trimmed === '(No Body)') return { kind: 'none', raw: trimmed || undefined };

  const jsonCandidate = extractJsonCandidate(trimmed);
  if (!jsonCandidate) return { kind: 'text', raw: trimmed };

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    return { kind: 'json', raw: trimmed, json: parsed };
  } catch {
    return { kind: 'text', raw: trimmed };
  }
}

export function parseLogLine(line: string, lineNumber: number): LogEvent {
  const rawLine = line;

  const tsMatch = line.match(
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(.+)$/,
  );

  const timestamp = tsMatch?.[1] ?? '';
  const rest = tsMatch?.[2] ?? line;
  const timestampMs = timestamp ? tryParseTimestampMs(timestamp) : undefined;

  // Split on ">>>>>>" / ">>>>>>>" etc.
  const parts = rest
    .split(/\s+>{5,}\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const eventType = parts[0] ?? rest.trim();

  let method: string | undefined;
  let url: string | undefined;
  let httpStatus: number | undefined;

  for (const part of parts) {
    if (!method && HTTP_METHODS.has(part.toUpperCase())) method = part.toUpperCase();

    if (url == null) {
      const urlCandidate = part.startsWith('URL:')
        ? part.replace(/^URL:\s*/i, '').trim()
        : part;
      if (/^https?:\/\//i.test(urlCandidate)) url = urlCandidate;
    }

    if (httpStatus == null) {
      const statusMatch = part.match(/\((\d{3})\)/);
      if (statusMatch) httpStatus = Number(statusMatch[1]);
    }
  }

  const bodyPart = parts.length >= 2 ? parts[parts.length - 1] : undefined;
  const body = parseBody(bodyPart);

  return {
    rawLine,
    lineNumber,
    timestamp,
    timestampMs,
    eventType,
    method,
    url,
    httpStatus,
    bodyKind: body.kind,
    bodyRaw: body.raw,
    bodyJson: body.json,
  };
}

export function parseLogText(text: string): LogEvent[] {
  const lines = text.split(/\r?\n/);
  const events: LogEvent[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    events.push(parseLogLine(line, i + 1));
  }

  return events;
}

