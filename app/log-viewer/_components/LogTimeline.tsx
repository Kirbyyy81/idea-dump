'use client';

import { Button } from '@/components/atoms/Button';
import type { LogTimelineRow, Transaction } from '@/lib/types';
import { sessionContext, sourceLabels, transactionEvents } from '@/lib/log-viewer/presentation';
import { transactionHasError } from '@/lib/log-viewer/transactions';
import { TransactionRow } from './TransactionDisplay';

export function LogTimeline({ rows, transactions, selected, onSelect, onNavigate }: {
  rows: LogTimelineRow[]; transactions: Transaction[]; selected: string | null;
  onSelect: (id: string) => void; onNavigate: (id: string) => void;
}) {
  const entry = (tx: Transaction) => {
    const context = sessionContext(tx, transactions);
    return <div key={tx.id} id={'log-' + tx.id} className="min-w-0 space-y-1">
      <TransactionRow tx={tx} expanded={selected === tx.id} onToggle={() => onSelect(tx.id)} />
      {context.length > 1 && <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
        <summary className="min-h-11 cursor-pointer px-3 py-2 text-xs">Session context</summary>
        <div className="space-y-1 px-3 pb-3">
          <p className="text-xs text-text-muted">Nearby recorded events within 60 seconds. This does not establish a causal connection.</p>
          {context.map(item => {
            const event = transactionEvents(item)[0];
            return <Button key={item.id} type="button" variant="ghost" className="min-h-11 w-full justify-start whitespace-normal break-all text-left text-xs"
              onClick={() => onNavigate(item.id)}>
              {event.timestamp} · {event.host ? event.host + ' · ' : ''}{item.endpointKey ?? event.eventType}
              {transactionHasError(item) ? ' · error' : ''}
            </Button>;
          })}
        </div>
      </details>}
    </div>;
  };
  return <>{rows.map(row => row.kind === 'auth' && row.transactions.length > 1 ? (
    <details key={row.transactions[0].id} className="min-w-0 rounded-lg border border-border-subtle bg-bg-base">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm">
        Auth and token events ({row.transactions.reduce((count, tx) => count + transactionEvents(tx).length, 0)})
        <span className="ml-2 text-xs text-text-muted">
          {sourceLabels[transactionEvents(row.transactions[0])[0].source ?? 'unknown']} · {transactionEvents(row.transactions[0])[0].timestamp}
          {' · '}{row.transactions.filter(transactionHasError).length} error{row.transactions.filter(transactionHasError).length === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border-subtle p-3">{row.transactions.map(entry)}</div>
    </details>
  ) : row.transactions.map(entry))}</>;
}
