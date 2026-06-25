'use client';

import { LogEvent } from '@/lib/logViewer/types';

export function EventHeader({ event }: { event: LogEvent }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
      <span className="font-mono">{event.timestamp || '-'}</span>
      <span className="px-2 py-0.5 rounded border border-border-subtle bg-bg-subtle text-text-secondary">
        {event.eventType || 'UNKNOWN'}
      </span>
      <span className="px-2 py-0.5 rounded border border-border-subtle bg-bg-base text-text-secondary">
        {event.lineType}
      </span>
      {event.httpStatus != null && (
        <span className="font-mono text-text-secondary">({event.httpStatus})</span>
      )}
      {event.method && (
        <span className="font-mono text-text-secondary">{event.method}</span>
      )}
      {event.endpointKey && (
        <span className="min-w-0 max-w-full break-all font-mono text-text-secondary">{event.endpointKey}</span>
      )}
      {event.url && (
        <span className="min-w-0 max-w-full break-all sm:max-w-[520px]">{event.url}</span>
      )}
      <span className="ml-auto shrink-0 font-mono">
        L{event.endLineNumber && event.endLineNumber !== event.lineNumber
          ? `${event.lineNumber}-${event.endLineNumber}`
          : event.lineNumber}
      </span>
    </div>
  );
}