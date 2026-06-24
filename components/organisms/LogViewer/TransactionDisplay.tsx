'use client';

import { Badge } from '@/components/atoms/Badge';
import { Textarea } from '@/components/atoms/Textarea';
import { cn } from '@/lib/utils';
import { LogEvent, Transaction } from '@/lib/logViewer/types';
import { transactionHasError } from '@/lib/logViewer/transactions';
import { EventHeader } from './EventHeader';
import { JsonOrText } from './JsonTree';
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
  return event.lineType === 'crash' || event.lineType === 'error' ? event : undefined;
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
  const lastResponse = tx.responses[tx.responses.length - 1];
  const standaloneEvent = getStandaloneTimelineEvent(tx);
  const status = lastResponse?.httpStatus;
  const isError = transactionHasError(tx);
  const statusText =
    tx.orphanKind === 'request'
      ? 'no response'
      : tx.orphanKind === 'response'
        ? 'orphan'
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
          <span>
            {standaloneEvent
              ? `${standaloneEvent.lineType} event`
              : `${tx.responses.length} resp`}
          </span>
          {durationMs != null && <span>- {formatMsDuration(durationMs)}</span>}
          {tx.lineRefs.length > 0 && <span>- lines {tx.lineRefs.join(', ')}</span>}
          {tx.contentData && <span>- content data</span>}
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
            title={standaloneEvent.lineType === 'crash' ? 'Crash details' : 'Error details'}
            event={standaloneEvent}
          />
          <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
              Raw {standaloneEvent.lineType} line
            </summary>
            <div className="px-3 pb-3">
              <Textarea
                className="min-h-[120px] w-full min-w-0 text-xs font-mono"
                value={standaloneEvent.rawLine}
                readOnly
              />
            </div>
          </details>
        </div>
      ) : tx.request ? (
        <div className="space-y-2">
          <EventHeader event={tx.request} />
          <JsonOrText title="Request body" event={tx.request} />
          <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
              Raw request line
            </summary>
            <div className="px-3 pb-3">
              <Textarea
                className="min-h-[120px] w-full min-w-0 text-xs font-mono"
                value={tx.request.rawLine}
                readOnly
              />
            </div>
          </details>
        </div>
      ) : (
        <div className="text-sm text-text-muted">
          No matching request (orphan response).
        </div>
      )}

      {tx.contentData && (
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <h3 className="font-heading text-sm text-text-secondary">Content Data</h3>
          <EventHeader event={tx.contentData} />
          <JsonOrText title="Content data payload" event={tx.contentData} />
          <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
              Raw content data line
            </summary>
            <div className="px-3 pb-3">
              <Textarea
                className="min-h-[120px] w-full min-w-0 text-xs font-mono"
                value={tx.contentData.rawLine}
                readOnly
              />
            </div>
          </details>
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
            {tx.responses.map((response) => (
              <div key={`${response.lineNumber}-${response.timestamp}`} className="space-y-2">
                <EventHeader event={response} />
                <JsonOrText title="Response body" event={response} />
                <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                    Raw response line
                  </summary>
                  <div className="px-3 pb-3">
                    <Textarea
                      className="min-h-[120px] w-full min-w-0 text-xs font-mono"
                      value={response.rawLine}
                      readOnly
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}