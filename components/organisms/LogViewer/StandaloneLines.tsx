'use client';

import { Textarea } from '@/components/atoms/Textarea';
import { LogEvent, UnparsedLogLine } from '@/lib/logViewer/types';
import { EventHeader } from './EventHeader';

export function StandaloneLines({
  unparsedLines,
  unmatchedContentData,
}: {
  unparsedLines: UnparsedLogLine[];
  unmatchedContentData: LogEvent[];
}) {
  if (unparsedLines.length === 0 && unmatchedContentData.length === 0) return null;

  return (
    <details className="min-w-0 rounded-lg border border-border-subtle bg-bg-base">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
        Unparsed / standalone lines ({unparsedLines.length + unmatchedContentData.length})
      </summary>
      <div className="min-w-0 space-y-3 px-3 pb-3">
        {unmatchedContentData.map((event) => (
          <div key={event.id} className="min-w-0 space-y-1">
            <EventHeader event={event} />
            <Textarea
              className="min-h-[70px] w-full min-w-0 text-xs font-mono"
              value={event.rawLine}
              readOnly
            />
          </div>
        ))}
        {unparsedLines.map((line) => (
          <div key={line.lineNumber} className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-text-muted">
              <span>L{line.lineNumber}</span>
              {line.reason && <span className="min-w-0 break-words text-right">{line.reason}</span>}
            </div>
            <Textarea
              className="min-h-[70px] w-full min-w-0 text-xs font-mono"
              value={line.rawLine}
              readOnly
            />
          </div>
        ))}
      </div>
    </details>
  );
}