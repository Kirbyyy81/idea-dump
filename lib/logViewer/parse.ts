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

function tryParseTimestampMs(timestamp: string): number | undefined {
  // Expected: "YYYY-MM-DD HH:mm:ss.SSS"
  const isoish = timestamp.replace(' ', 'T');
  const parsed = Date.parse(isoish);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function classifyLine(text: string): LogLineType {
  const upper = text.toUpperCase();
  if (upper.includes('CRASH')) return 'crash';
  if (upper.includes('CONTENT DATA')) return 'content_data';
  if (upper.includes('RESPONSE')) return 'response';
  if (upper.includes('REQUEST')) return 'request';
  return 'other';
}

function startsTimestampedKnownEvent(line: string): boolean {
  const match = line.match(
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+(.+)$/,
  );
  if (!match) return false;

  const type = classifyLine(match[1]);
  return type === 'request' || type === 'response' || type === 'content_data' || type === 'crash';
}

function extractJsonCandidate(text: string): string | undefined {
  const starts = ['{', '[']
    .map((char) => text.indexOf(char))
    .filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
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

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[),.;]+$/, '');
}

function normalizeEndpointKey(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    if (segments.length === 0) return parsed.pathname || url;
    return `/${segments.slice(-3).join('/')}`;
  } catch {
    const withoutQuery = url.split(/[?#]/)[0]?.replace(/\/+$/, '') || url;
    const segments = withoutQuery.split('/').filter(Boolean);
    return segments.length > 0 ? `/${segments.slice(-3).join('/')}` : withoutQuery;
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

export function parseLogLine(line: string, lineNumber: number, endLineNumber?: number): LogEvent {
  const rawLine = line;

  const tsMatch = line.match(
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]+)$/,
  );

  const timestamp = tsMatch?.[1] ?? '';
  const rest = tsMatch?.[2] ?? line;
  const timestampMs = timestamp ? tryParseTimestampMs(timestamp) : undefined;
  const lineType = classifyLine(rest);

  // Split on ">>>>>>" / ">>>>>>>" etc.
  const parts = rest
    .split(/\s+>{5,}\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const eventType = parts[0] ?? rest.trim();

  let method: string | undefined;
  let url: string | undefined = extractUrl(rest);
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

  if (httpStatus == null) {
    const statusMatch = rest.match(/\((\d{3})\)/);
    if (statusMatch) httpStatus = Number(statusMatch[1]);
  }

  const body = parseBody(rest);

  return {
    id: `line_${lineNumber}`,
    rawLine,
    lineNumber,
    endLineNumber,
    timestamp,
    timestampMs,
    lineType,
    eventType: lineType === 'crash' ? 'CRASH' : eventType,
    method,
    url,
    endpointKey: lineType === 'crash'
      ? `Crash${extractCrashContext(rest) ? `: ${extractCrashContext(rest)}` : ''}`
      : normalizeEndpointKey(url),
    httpStatus,
    functionName: lineType === 'content_data'
      ? extractContentDataFunction(rest)
      : lineType === 'crash'
        ? extractCrashContext(rest)
        : undefined,
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

    if (classifyLine(line) === 'crash') {
      const crashLines = [line];
      let endIndex = i;

      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = lines[j];
        if (nextLine.trim() && startsTimestampedKnownEvent(nextLine)) break;
        crashLines.push(nextLine);
        endIndex = j;
      }

      events.push(parseLogLine(crashLines.join('\n'), i + 1, endIndex + 1));
      i = endIndex;
      continue;
    }

    events.push(parseLogLine(line, i + 1));
  }

  return events;
}

