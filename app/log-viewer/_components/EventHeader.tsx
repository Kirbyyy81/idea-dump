'use client';

import { LogEvent } from '@/lib/log-viewer/types';
import { RawLineLink } from './RawLineLink';
import { sourceLabels } from '@/lib/log-viewer/presentation';
import { Badge } from '@/components/atoms/Badge';

export function EventHeader({ event }: { event: LogEvent }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
      <span className="font-mono">{event.timestamp || '-'}</span>
      <span className="min-w-0 max-w-full break-words px-2 py-0.5 rounded border border-border-subtle bg-bg-subtle text-text-secondary">
        {event.eventType || 'UNKNOWN'}
      </span>
      <span className="px-2 py-0.5 rounded border border-border-subtle bg-bg-base text-text-secondary">
        {event.lineType}
      </span>
      <Badge variant="default">{sourceLabels[event.source ?? 'unknown']}</Badge>
      {event.bodyParseError && <Badge variant="default" className="border-warning text-warning">JSON parse warning</Badge>}
      {event.httpStatus != null && (
        <span className="font-mono text-text-secondary">({event.httpStatus})</span>
      )}
      {event.method && (
        <span className="font-mono text-text-secondary">{event.method}</span>
      )}
      {event.durationMs != null && (
        <span className="font-mono text-text-secondary">{event.durationMs} ms</span>
      )}
      {event.requestId && (
        <span className="font-mono text-text-secondary">req {event.requestId}</span>
      )}
      {event.responseId && (
        <span className="font-mono text-text-secondary">res {event.responseId}</span>
      )}
      {event.clientRequestId && (
        <span className="font-mono text-text-secondary">client {event.clientRequestId}</span>
      )}
      {event.endpointKey && (
        <span className="min-w-0 max-w-full break-all font-mono text-text-secondary">{event.endpointKey}</span>
      )}
      {event.url && (
        <span className="min-w-0 max-w-full break-all sm:max-w-[520px]">{event.url}</span>
      )}
      <span className="ml-auto shrink-0 font-mono">
        <RawLineLink start={event.lineNumber} end={event.endLineNumber} />
      </span>
    </div>
  );
}
