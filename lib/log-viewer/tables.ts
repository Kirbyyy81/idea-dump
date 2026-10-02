import type { LogEvent, LogTableDump, LogTableRow, Transaction } from '@/lib/types';

// Commas and row markers inside quoted or nested values belong to the value.
function splitOutsideValues(text: string, separator: RegExp): string[] | undefined {
  const parts: string[] = [];
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return undefined;
    }
    if (stack.length) continue;
    separator.lastIndex = i;
    const match = separator.exec(text);
    if (match) {
      parts.push(text.slice(start, i));
      start = i + match[0].length;
      i = start - 1;
    }
  }
  if (quoted || stack.length) return undefined;
  parts.push(text.slice(start));
  return parts;
}

function parseRow(rawText: string): LogTableRow {
  const parts = splitOutsideValues(rawText, /,\s*(?=[A-Za-z_]\w*=)/y);
  const matches = parts?.map((part) => part.match(/^([A-Za-z_]\w*)=([\s\S]*)$/));
  if (!matches?.length || matches.some((match) => !match)) return { rawText };
  return { rawText, fields: matches.map((match) => ({ name: match![1], value: match![2] })) };
}

export function parseTableDump(text: string): LogTableDump | undefined {
  const empty = text.match(/^Table\s+([A-Za-z_]\w*)\s+is empty\s*$/);
  if (empty) return { name: empty[1], empty: true, rows: [] };
  const header = text.match(/^={3,}\s*Table:\s*([A-Za-z_]\w*)\s*={3,}[ \t]*([\s\S]*)$/);
  if (!header) return undefined;
  const body = header[2].replace(/\r?\n$/, '');
  const rowStart = body.match(/^Row:[ \t]*/);
  if (!rowStart) return { name: header[1], empty: false, rows: [{ rawText: body }] };
  const rawRows = splitOutsideValues(body.slice(rowStart[0].length), /(?:={3,}[ \t]*|\r?\n[ \t]*)Row:[ \t]*/y);
  return {
    name: header[1], empty: false,
    rows: rawRows ? rawRows.map(parseRow) : [{ rawText: body }],
  };
}

// Run after correlation, using original event positions to keep batch boundaries exact.
export function groupTableTransactions(events: LogEvent[], transactions: Transaction[]): Transaction[] {
  const standalone = new Map(transactions.filter((tx) => !tx.request && tx.responses.length === 1 && tx.responses[0].tableDump)
    .map((tx) => [tx.responses[0], tx]));
  const replacements = new Map<Transaction, Transaction>();
  const consumed = new Set<Transaction>();
  let batch: Transaction | undefined;
  let previous: LogEvent | undefined;
  for (const event of events) {
    const tx = standalone.get(event);
    if (!tx || !event.tableDump) { batch = undefined; previous = undefined; continue; }
    const gap = event.timestampMs != null && previous?.timestampMs != null
      ? event.timestampMs - previous.timestampMs : undefined;
    const continues = batch && previous && previous.source === event.source &&
      previous.sourceSegment === event.sourceSegment && gap != null && gap >= 0 && gap <= 1000 &&
      !batch.tableBatch!.some((table) => table.name === event.tableDump!.name);
    if (!continues) {
      batch = { ...tx, endpointKey: 'Table dump', responses: [], lineRefs: [], tableBatch: [] };
      replacements.set(tx, batch);
    } else consumed.add(tx);
    batch!.responses.push(event);
    batch!.tableBatch!.push(event.tableDump);
    batch!.endedAtMs = event.timestampMs;
    for (let line = event.lineNumber; line <= (event.endLineNumber ?? event.lineNumber); line += 1) {
      batch!.lineRefs.push(line);
    }
    previous = event;
  }
  return transactions.filter((tx) => !consumed.has(tx)).map((tx) => replacements.get(tx) ?? tx);
}
