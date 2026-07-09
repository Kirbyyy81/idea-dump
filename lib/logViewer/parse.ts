import { LogBodyKind, LogEvent, LogLineType } from '@/lib/logViewer/types';

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]+)$/;

function tryParseTimestampMs(timestamp: string): number | undefined {
  const isoish = timestamp.replace(' ', 'T');
  const parsed = Date.parse(isoish);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstJsonIndex(text: string): number {
  const starts = ['{', '[']
    .map((char) => text.indexOf(char))
    .filter((index) => index >= 0);
  return starts.length > 0 ? Math.min(...starts) : -1;
}

function markerText(text: string): string {
  const jsonIndex = firstJsonIndex(text);
  return (jsonIndex >= 0 ? text.slice(0, jsonIndex) : text).trim();
}

function classifyLine(rest: string, hasTimestamp: boolean): LogLineType {
  const marker = markerText(rest).toUpperCase();

  if (/^CONTENT\s+DATA\b/.test(marker)) return 'content_data';
  if (/^JSON\s+DATA\s+STRING\b/.test(marker)) return 'content_data';
  if (/\b(?:AUTH_)?RESPONSE(?:_|\b)/.test(marker) || /\bRESULT\b/.test(marker)) return 'response';
  if (
    /^AUTH_REQUEST\b/.test(marker) ||
    /^EKYC\s+BASIC\s+AUTH\s+REQUEST\b/.test(marker) ||
    /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+REQUEST\b/.test(marker) ||
    /\bREQUEST(?:_|[\s>])/.test(marker)
  ) {
    return 'request';
  }
  if (/\bCRASH\b/.test(marker)) return 'crash';
  if (/^ERROR\b/.test(marker) || /\bEXCEPTION\b/.test(marker)) return 'error';
  return hasTimestamp ? 'info' : 'other';
}

function startsTimestampedEvent(line: string): boolean {
  return TIMESTAMP_PATTERN.test(line);
}

function extractJsonCandidate(text: string): string | undefined {
  const start = firstJsonIndex(text);
  if (start === -1) return undefined;

  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  const stack: string[] = [closer];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') stack.push('}');
    if (char === '[') stack.push(']');

    if (char === '}' || char === ']') {
      if (stack[stack.length - 1] !== char) return undefined;
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1).trim();
    }
  }

  return undefined;
}

function parseBody(bodyText: string | undefined): {
  kind: LogBodyKind;
  raw?: string;
  json?: unknown;
  parseError?: boolean;
} {
  if (!bodyText) return { kind: 'none' };
  const trimmed = bodyText.trim();
  if (!trimmed || trimmed === '(No Body)') return { kind: 'none', raw: trimmed || undefined };

  const jsonCandidate = extractJsonCandidate(trimmed);
  if (!jsonCandidate) return { kind: 'text', raw: trimmed };

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    return { kind: 'json', raw: jsonCandidate, json: parsed };
  } catch {
    return { kind: 'text', raw: jsonCandidate, parseError: true };
  }
}

function trimUrlCandidate(url: string): string {
  return url.replace(/[),.;]+$/, '').replace(/[}\]]+$/, '');
}

function extractUrl(text: string): string | undefined {
  const withoutJson = text.slice(0, firstJsonIndex(text) >= 0 ? firstJsonIndex(text) : text.length);
  const urlLabelMatch = withoutJson.match(/URL:\s*(https?:\/\/[^\s<>"')]+(?:\([^)]+\))?)/i);
  if (urlLabelMatch?.[1]) return trimUrlCandidate(urlLabelMatch[1]);

  const match = withoutJson.match(/https?:\/\/[^\s<>"')]+(?:\([^)]+\))?/i);
  return match?.[0] ? trimUrlCandidate(match[0]) : undefined;
}

function getUrlParts(url: string | undefined): { host?: string; path?: string; endpointKey?: string } {
  if (!url) return {};

  try {
    const parsed = new URL(url);
    const path = parsed.pathname || '/';
    return {
      host: parsed.host,
      path,
      endpointKey: path,
    };
  } catch {
    const withoutQuery = url.split(/[?#]/)[0]?.replace(/\/+$/, '') || url;
    const segments = withoutQuery.split('/').filter(Boolean);
    const path = segments.length > 0 ? `/${segments.join('/')}` : withoutQuery;
    return { path, endpointKey: path };
  }
}

function extractContentDataFunction(rest: string): string | undefined {
  const match = rest.match(/CONTENT\s+DATA\s*>>\s*([^>]+?)\s*>>/i);
  return match?.[1]?.trim();
}

function extractCrashContext(rest: string): string | undefined {
  const match = rest.match(/CRASH\s*>+\s*(?:>*\s*)?([^>]+?)\s*>+/i);
  return match?.[1]?.trim();
}

function extractInfoEventType(rest: string): string {
  if (/^NEW\s+AUTH\s+TOKEN\s+REQUESTED/i.test(rest)) return 'Auth Token Requested';
  if (/^NEW\s+AUTH\s+TOKEN\s+GENERATED/i.test(rest)) return 'Auth Token Generated';
  if (/^APP\s+VERSION\s+CODE:/i.test(rest)) return 'App Version';
  if (/^EKYC_CAPTURE\b/i.test(rest)) return 'EKYC Capture';
  return markerText(rest).split(/\s+>{2,}|\s+-\s+/)[0]?.trim() || 'Info';
}

function extractMethod(rest: string, parts: string[], eventType: string): string | undefined {
  const eventMethod = eventType.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+REQUEST\b/i)?.[1];
  if (eventMethod) return eventMethod.toUpperCase();

  for (const part of parts) {
    const normalized = part.replace(/^URL:\s*/i, '').trim().toUpperCase();
    if (HTTP_METHODS.has(normalized)) return normalized;
  }

  const inlineMatch = rest.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s+https?:\/\//i);
  return inlineMatch?.[1]?.toUpperCase();
}

function extractHttpStatus(rest: string, parts: string[]): number | undefined {
  for (const part of parts) {
    const statusMatch = part.match(/\((\d{3})\)/);
    if (statusMatch) return Number(statusMatch[1]);
  }

  const statusMatch = rest.match(/\((\d{3})\)/);
  return statusMatch ? Number(statusMatch[1]) : undefined;
}

function extractDurationMs(rest: string): number | undefined {
  const msMatch = rest.match(/>>>\s*(\d+)\s*ms\b/i);
  if (msMatch) return Number(msMatch[1]);

  const durationMatch = rest.match(/\bduration\s*>>\s*(\d+)\s*>>/i);
  return durationMatch ? Number(durationMatch[1]) : undefined;
}

function findStringField(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, fieldName);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const direct = record[fieldName];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (typeof direct === 'number') return String(direct);

  for (const item of Object.values(record)) {
    const found = findStringField(item, fieldName);
    if (found) return found;
  }

  return undefined;
}

export function parseLogLine(line: string, lineNumber: number, endLineNumber?: number): LogEvent {
  const rawLine = line;
  const tsMatch = line.match(TIMESTAMP_PATTERN);

  const timestamp = tsMatch?.[1] ?? '';
  const rest = tsMatch?.[2] ?? line;
  const timestampMs = timestamp ? tryParseTimestampMs(timestamp) : undefined;
  const lineType = classifyLine(rest, Boolean(timestamp));

  const parts = rest
    .split(/\s+>{5,}\s+|\s+>>>\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const defaultEventType = markerText(parts[0] ?? rest).trim();
  const eventType = lineType === 'crash'
    ? 'CRASH'
    : lineType === 'info'
      ? extractInfoEventType(rest)
      : defaultEventType;

  const url = lineType === 'content_data' || lineType === 'info' ? undefined : extractUrl(rest);
  const urlParts = getUrlParts(url);
  const method = extractMethod(rest, parts, eventType);
  const body = parseBody(rest);
  const requestId = findStringField(body.json, 'requestId');
  const responseId = findStringField(body.json, 'responseId');
  const clientRequestId = findStringField(body.json, 'clientRequestId');
  const functionName = lineType === 'content_data'
    ? extractContentDataFunction(rest)
    : lineType === 'crash'
      ? extractCrashContext(rest)
      : undefined;

  return {
    id: `line_${lineNumber}`,
    rawLine,
    lineNumber,
    endLineNumber,
    timestamp,
    timestampMs,
    lineType,
    eventType,
    method,
    url,
    endpointKey: lineType === 'crash'
      ? `Crash${functionName ? `: ${functionName}` : ''}`
      : lineType === 'error'
        ? 'Error'
        : lineType === 'info'
          ? eventType
          : urlParts.endpointKey,
    host: urlParts.host,
    path: urlParts.path,
    httpStatus: extractHttpStatus(rest, parts),
    functionName,
    requestId,
    responseId,
    clientRequestId,
    durationMs: extractDurationMs(rest),
    bodyKind: body.kind,
    bodyRaw: body.raw,
    bodyJson: body.json,
    bodyParseError: body.parseError,
  };
}

export function parseLogText(text: string): LogEvent[] {
  const lines = text.split(/\r?\n/);
  const events: LogEvent[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const blockLines = [line];
    let endIndex = i;

    if (startsTimestampedEvent(line)) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = lines[j];
        if (nextLine.trim() && startsTimestampedEvent(nextLine)) break;
        blockLines.push(nextLine);
        endIndex = j;
      }
    }

    events.push(parseLogLine(blockLines.join('\n'), i + 1, endIndex + 1));
    i = endIndex;
  }

  return events;
}
