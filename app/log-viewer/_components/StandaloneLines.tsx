'use client';

import { Textarea } from '@/components/atoms/Textarea';
import { LogEvent, UnparsedLogLine } from '@/lib/log-viewer/types';
import { EventHeader } from './EventHeader';
import { JsonOrText } from './JsonTree';
import { RawLineLink } from './RawLineLink';
import { sourceLabels } from '@/lib/log-viewer/presentation';

export function StandaloneLines({
  unparsedLines,
  unmatchedContentData,
  open = false,
}: {
  unparsedLines: UnparsedLogLine[];
  unmatchedContentData: LogEvent[];
  open?: boolean;
}) {
  if (unparsedLines.length === 0 && unmatchedContentData.length === 0) return null;

  const entries = [
    ...unmatchedContentData.map(event => ({ lineNumber: event.lineNumber, content: (
      <div key={event.id} className="min-w-0 space-y-1">
        <EventHeader event={event} />
        <JsonOrText title="Content data payload" event={event} />
      </div>
    ) })),
    ...unparsedLines.map(line => ({ lineNumber: line.lineNumber, content: (
      <div key={line.lineNumber} className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-text-muted">
          <RawLineLink start={line.lineNumber} end={line.endLineNumber} />
          <span>{sourceLabels[line.source ?? 'unknown']}</span>
          {line.reason && <span className="min-w-0 break-words text-right">{line.reason}</span>}
        </div>
        <Textarea
          aria-label={`Unparsed lines ${line.lineNumber}-${line.endLineNumber ?? line.lineNumber}`}
          className="min-h-[70px] w-full min-w-0 text-xs font-mono"
          value={line.rawLine}
          readOnly
        />
      </div>
    ) })),
  ].sort((a, b) => b.lineNumber - a.lineNumber);

  return (
    <details open={open || undefined} className="min-w-0 rounded-lg border border-border-subtle bg-bg-base">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
        Unparsed / standalone lines ({unparsedLines.reduce((count, line) => count + (line.endLineNumber ?? line.lineNumber) - line.lineNumber + 1, 0) + unmatchedContentData.length})
      </summary>
      <div className="min-w-0 space-y-3 px-3 pb-3">
        {entries.map(entry => entry.content)}
      </div>
    </details>
  );
}
