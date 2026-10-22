'use client';

import { Badge } from '@/components/atoms/Badge';
import { cn } from '@/lib/utils';
import { LogEvent, Transaction } from '@/lib/log-viewer/types';
import { transactionHasError } from '@/lib/log-viewer/transactions';
import { EventHeader } from './EventHeader';
import { JsonOrText } from './JsonTree';
import { TableDumpRow } from './TableDumpRow';
import { sourceLabels, transactionEvents } from '@/lib/log-viewer/presentation';
import { RawLineLink } from './RawLineLink';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

function formatMsDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round((s - m * 60) * 10) / 10;
  return `${m}m ${rem}s`;
}

function getStandaloneTimelineEvent(tx: Transaction): LogEvent | undefined {
  const event = tx.responses.length === 1 ? tx.responses[0] : undefined;
  if (!event || tx.request) return undefined;
  return event.lineType === 'crash' || event.lineType === 'error' || event.lineType === 'info'
    ? event
    : undefined;
}

export function TransactionRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: Transaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (tx.tableBatch) return <TableDumpRow tx={tx} expanded={expanded} onToggle={onToggle} />;
  const lastResponse = tx.responses[tx.responses.length - 1];
  const standaloneEvent = getStandaloneTimelineEvent(tx);
  const events = transactionEvents(tx);
  const anchor = tx.request ?? tx.responses[0];
  const statuses = [...new Set(tx.responses.map(event => event.httpStatus).filter((status): status is number => status != null))];
  const status = statuses.find(status => status >= 400) ?? lastResponse?.httpStatus;
  const isError = transactionHasError(tx);
  const statusText =
    tx.orphanKind === 'request'
      ? 'no response'
      : tx.orphanKind === 'response'
        ? 'Request not logged'
        : standaloneEvent?.lineType === 'info'
          ? 'info'
        : isError
          ? 'error'
          : status != null
            ? String(status)
            : 'ok';
  const durationMs =
    tx.startedAtMs != null && tx.endedAtMs != null ? tx.endedAtMs - tx.startedAtMs : undefined;

  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border transition-colors',
        expanded
          ? 'border-accent-rose bg-accent-rose/10'
          : 'border-border-subtle bg-bg-base',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="w-full min-w-0 p-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-2">
          <Badge
            variant={isError ? 'archived' : tx.orphanKind ? 'default' : 'complete'}
            className={cn(isError && 'border-error bg-error-bg text-error')}
            title={tx.orphanKind ? `Orphan ${tx.orphanKind}` : isError ? 'Has error' : 'No error detected'}
          >
            {statusText}
          </Badge>
          <span className="shrink-0 text-xs font-mono text-text-secondary">
            {tx.method ?? tx.request?.method ?? '-'}
          </span>
          <span className="min-w-0 flex-1 break-all text-sm text-text-primary">
            {tx.endpointKey ?? tx.url ?? 'Unknown endpoint'}
          </span>
          {expanded ? (
            <ChevronDown size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {statuses.filter(code => statusText !== String(code)).map(code => <Badge key={code} variant="default"
            className={cn(code >= 400 && 'border-error text-error')}>{code}</Badge>)}
          {tx.responses.length > 1 && <Badge variant="default">{tx.responses.length} responses</Badge>}
          <span className="font-mono">{anchor?.timestamp}</span>
          <Badge variant="default">{sourceLabels[anchor?.source ?? 'unknown']}</Badge>
          {tx.host && <span className="break-all">{tx.host}</span>}
          {events.some(event => event.bodyParseError) && <Badge variant="default" className="border-warning text-warning">JSON parse warning</Badge>}
          <span>
            {standaloneEvent
              ? `${standaloneEvent.lineType} event`
              : `${tx.responses.length} response${tx.responses.length === 1 ? '' : 's'}`}
          </span>
          {lastResponse?.durationMs != null && <span>- {formatMsDuration(lastResponse.durationMs)}</span>}
          {durationMs != null && <span>- {formatMsDuration(durationMs)}</span>}
          {tx.lineRefs.length > 0 && <span>- lines {tx.lineRefs.join(', ')}</span>}
          {tx.contentData && <span>- content data{tx.contentMatch ? ` (${tx.contentMatch.confidence} confidence)` : ''}</span>}
          {tx.correlationId && <span>- id {tx.correlationId}</span>}
          {tx.hadConcurrency && <span title="Multiple outstanding requests on same endpoint">- low conf</span>}
          {!tx.hadConcurrency && tx.confidence !== 'unknown' && <span>- {tx.confidence} conf</span>}
          {isError && (
            <span className="ml-auto inline-flex items-center gap-1 text-error">
              <AlertTriangle size={12} />
              error
            </span>
          )}
        </div>
      </button>

      <div className="px-2"><RawLineLink start={tx.lineRefs[0]} end={tx.lineRefs.at(-1)} /></div>

      {expanded && <TransactionDetails tx={tx} />}
    </div>
  );
}

function TransactionDetails({ tx }: { tx: Transaction }) {
  const standaloneEvent = getStandaloneTimelineEvent(tx);

  return (
    <div className="min-w-0 space-y-3 border-t border-border-subtle p-4">
      {standaloneEvent ? (
        <div className="space-y-2">
          <EventHeader event={standaloneEvent} />
          <JsonOrText
            title={standaloneEvent.lineType === 'crash'
              ? 'Crash details'
              : standaloneEvent.lineType === 'error'
                ? 'Error details'
                : 'Info details'}
            event={standaloneEvent}
          />
        </div>
      ) : tx.request ? (
        <div className="space-y-2">
          <EventHeader event={tx.request} />
          <JsonOrText title="Request body" event={tx.request} />
        </div>
      ) : (
        <div className="text-sm text-text-muted">
          Request not logged.
        </div>
      )}

      {tx.contentData && (
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <h3 className="font-heading text-sm text-text-secondary">Content Data</h3>
          <EventHeader event={tx.contentData} />
          <JsonOrText title="Content data payload" event={tx.contentData} />
        </div>
      )}

      {!standaloneEvent && (
      <div className="pt-2 border-t border-border-subtle">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-sm text-text-secondary">
            Responses ({tx.responses.length})
          </h3>
          {transactionHasError(tx) && (
            <span className="text-xs text-error inline-flex items-center gap-1">
              <AlertTriangle size={12} />
              error detected
            </span>
          )}
        </div>

        {tx.responses.length === 0 ? (
          <p className="text-sm text-text-muted">No responses paired.</p>
        ) : (
          <div className="space-y-3">
            {[...tx.responses].reverse().map((response) => (
              <div key={`${response.lineNumber}-${response.timestamp}`} className="space-y-2">
                <EventHeader event={response} />
                <JsonOrText title="Response body" event={response} />
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
