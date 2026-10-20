'use client';

import { useState } from 'react';
import { Badge } from '@/components/atoms/Badge';
import { sourceLabels, transactionEvents } from '@/lib/log-viewer/presentation';
import { transactionHasError } from '@/lib/log-viewer/transactions';
import type { Transaction } from '@/lib/types';
import { EventHeader } from './EventHeader';
import { JsonOrText } from './JsonTree';
import { RawLineLink } from './RawLineLink';

export function ReaderEventGroup({ transactions }: { transactions: Transaction[] }) {
  const [open, setOpen] = useState(false);
  const first = transactionEvents(transactions[0])[0];
  const last = transactionEvents(transactions[transactions.length - 1])[0];
  const errors = transactions.filter(transactionHasError).length;
  return <details className="min-w-0 rounded-lg border border-border-subtle bg-bg-base"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm">
      SECURE_METRIC_READER ({transactions.length} {transactions.length === 1 ? 'event' : 'events'})
      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Badge variant="default">{sourceLabels[first.source ?? 'unknown']}</Badge>
        <span className="font-mono">{first.timestamp} to {last.timestamp}</span>
        <span>lines {first.lineNumber}-{last.endLineNumber ?? last.lineNumber}</span>
        <Badge variant="default" className={errors ? 'border-error text-error' : undefined}>
          {errors} {errors === 1 ? 'error' : 'errors'}
        </Badge>
        {transactions.some(tx => transactionEvents(tx).some(event => event.bodyParseError))
          && <Badge variant="default" className="border-warning text-warning">JSON parse warning</Badge>}
      </span>
    </summary>
    <div className="px-2"><RawLineLink start={first.lineNumber} end={last.endLineNumber ?? last.lineNumber} /></div>
    {open && <div className="min-w-0 divide-y divide-border-subtle border-t border-border-subtle px-3">
      {[...transactions].reverse().map(tx => {
        const event = transactionEvents(tx)[0];
        return <div key={tx.id} id={'log-' + tx.id} className="min-w-0 space-y-2 py-3">
          <EventHeader event={event} />
          {transactionHasError(tx) && <span className="text-xs text-error">error</span>}
          <JsonOrText title="Reader details" event={event} />
        </div>;
      })}
    </div>}
  </details>;
}
