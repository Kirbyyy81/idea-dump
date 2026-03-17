'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { cn } from '@/lib/utils';
import { parseLogText } from '@/lib/logViewer/parse';
import { buildTransactions, transactionHasError } from '@/lib/logViewer/transactions';
import { LogEvent, Transaction } from '@/lib/logViewer/types';
import { AlertTriangle, FileText, Search, X } from 'lucide-react';

function formatMsDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round((s - m * 60) * 10) / 10;
  return `${m}m ${rem}s`;
}

function JsonOrText({
  title,
  event,
}: {
  title: string;
  event: LogEvent;
}) {
  const hasJson = event.bodyKind === 'json' && event.bodyJson != null;
  const raw = event.bodyRaw ?? '';

  return (
    <details className="border border-border-subtle rounded-md bg-bg-base">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-text-muted">
          {hasJson ? 'json' : event.bodyKind === 'none' ? 'no body' : 'text'}
        </span>
      </summary>
      <div className="px-3 pb-3 pt-0">
        {hasJson ? (
          <pre className="text-xs whitespace-pre-wrap break-words font-mono text-text-primary">
            {JSON.stringify(event.bodyJson, null, 2)}
          </pre>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-words font-mono text-text-primary">
            {raw || '(No Body)'}
          </pre>
        )}
      </div>
    </details>
  );
}

function EventHeader({ event }: { event: LogEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <span className="font-mono">{event.timestamp || '—'}</span>
      <span className="px-2 py-0.5 rounded border border-border-subtle bg-bg-subtle text-text-secondary">
        {event.eventType || 'UNKNOWN'}
      </span>
      {event.httpStatus != null && (
        <span className="font-mono text-text-secondary">({event.httpStatus})</span>
      )}
      {event.method && (
        <span className="font-mono text-text-secondary">{event.method}</span>
      )}
      {event.url && (
        <span className="truncate max-w-[520px]">{event.url}</span>
      )}
      <span className="ml-auto font-mono">L{event.lineNumber}</span>
    </div>
  );
}

function TransactionRow({
  tx,
  selected,
  onSelect,
}: {
  tx: Transaction;
  selected: boolean;
  onSelect: () => void;
}) {
  const lastResponse = tx.responses[tx.responses.length - 1];
  const status = lastResponse?.httpStatus;
  const isError = transactionHasError(tx);
  const durationMs =
    tx.startedAtMs != null && tx.endedAtMs != null ? tx.endedAtMs - tx.startedAtMs : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md border transition-colors',
        selected
          ? 'border-accent-rose bg-accent-rose/10'
          : 'border-border-subtle hover:bg-bg-hover',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-xs font-mono px-2 py-0.5 rounded border',
            isError ? 'border-error text-error' : 'border-border-subtle text-text-secondary',
          )}
          title={isError ? 'Has error' : 'No error detected'}
        >
          {status != null ? status : tx.orphanResponse ? 'orphan' : '—'}
        </span>
        <span className="text-xs font-mono text-text-secondary">
          {tx.method ?? tx.request?.method ?? '—'}
        </span>
        <span className="truncate text-sm text-text-primary flex-1">{tx.url ?? 'Unknown URL'}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
        <span>{tx.responses.length} resp</span>
        {durationMs != null && <span>· {formatMsDuration(durationMs)}</span>}
        {tx.hadConcurrency && <span title="Multiple outstanding requests on same URL">· low conf</span>}
        {!tx.hadConcurrency && tx.confidence !== 'unknown' && <span>· {tx.confidence} conf</span>}
        {isError && (
          <span className="ml-auto inline-flex items-center gap-1 text-error">
            <AlertTriangle size={12} />
            error
          </span>
        )}
      </div>
    </button>
  );
}

export function LogViewer() {
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(10);
  const [query, setQuery] = useState<string>('');
  const [errorsOnly, setErrorsOnly] = useState<boolean>(false);

  const selectedTx = useMemo(
    () => transactions.find((t) => t.id === selectedTxId) ?? null,
    [transactions, selectedTxId],
  );

  const indexed = useMemo(() => {
    const rows = transactions.map((tx) => {
      const searchParts: string[] = [];
      if (tx.url) searchParts.push(tx.url);
      if (tx.request?.bodyRaw) searchParts.push(tx.request.bodyRaw);
      for (const r of tx.responses) {
        if (r.bodyRaw) searchParts.push(r.bodyRaw);
        if (r.rawLine) searchParts.push(r.rawLine);
      }
      if (tx.request?.rawLine) searchParts.push(tx.request.rawLine);
      return { tx, searchText: searchParts.join('\n').toLowerCase() };
    });
    return rows;
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return indexed
      .filter(({ tx, searchText }) => {
        if (errorsOnly && !transactionHasError(tx)) return false;
        if (!q) return true;
        return searchText.includes(q);
      })
      .map(({ tx }) => tx);
  }, [indexed, query, errorsOnly]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setRawText(text);
    const parsedEvents = parseLogText(text);
    setEvents(parsedEvents);
    const { transactions: txs } = buildTransactions(parsedEvents, {
      inactivityTimeoutMs: Math.max(0, Math.round(timeoutSeconds * 1000)),
    });
    setTransactions(txs);
    setSelectedTxId(txs[0]?.id ?? null);
  };

  const rebuildTransactions = () => {
    const { transactions: txs } = buildTransactions(events, {
      inactivityTimeoutMs: Math.max(0, Math.round(timeoutSeconds * 1000)),
    });
    setTransactions(txs);
    if (selectedTxId && !txs.some((t) => t.id === selectedTxId)) {
      setSelectedTxId(txs[0]?.id ?? null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-text-muted" />
            <h1 className="font-heading text-lg text-text-primary">Log Viewer</h1>
            {fileName && <span className="text-sm text-text-muted truncate max-w-[420px]">{fileName}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-text-muted flex items-center gap-2">
              Timeout (s)
              <Input
                type="number"
                min={0}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="w-20"
              />
            </label>

            <Button variant="ghost" onClick={rebuildTransactions} title="Rebuild pairing">
              Rebuild
            </Button>

            <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              Errors only
            </label>

            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                type="text"
                placeholder="Search URL / payload..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-7 w-64"
              />
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setFileName('');
                setRawText('');
                setEvents([]);
                setTransactions([]);
                setSelectedTxId(null);
                setQuery('');
                setErrorsOnly(false);
              }}
              icon={<X size={16} />}
              title="Clear"
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <p className="text-xs text-text-muted">
            Client-only: the file is processed in your browser and never uploaded.
          </p>
        </div>
      </Card>

      {transactions.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-text-muted">Upload a log file to begin.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-sm text-text-secondary">
                Transactions
              </h2>
              <span className="text-xs text-text-muted">
                {filteredTransactions.length} / {transactions.length}
              </span>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
              {filteredTransactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  selected={tx.id === selectedTxId}
                  onSelect={() => setSelectedTxId(tx.id)}
                />
              ))}
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-sm text-text-secondary">Details</h2>
              {selectedTx && (
                <span className="text-xs text-text-muted font-mono">{selectedTx.id}</span>
              )}
            </div>

            {!selectedTx ? (
              <p className="text-sm text-text-muted">Select a transaction.</p>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
                {selectedTx.request ? (
                  <div className="space-y-2">
                    <EventHeader event={selectedTx.request} />
                    <JsonOrText title="Request body" event={selectedTx.request} />
                    <details className="border border-border-subtle rounded-md bg-bg-base">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                        Raw request line
                      </summary>
                      <div className="px-3 pb-3">
                        <Textarea
                          className="w-full text-xs font-mono min-h-[90px]"
                          value={selectedTx.request.rawLine}
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

                <div className="pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-heading text-sm text-text-secondary">
                      Responses ({selectedTx.responses.length})
                    </h3>
                    {transactionHasError(selectedTx) && (
                      <span className="text-xs text-error inline-flex items-center gap-1">
                        <AlertTriangle size={12} />
                        error detected
                      </span>
                    )}
                  </div>

                  {selectedTx.responses.length === 0 ? (
                    <p className="text-sm text-text-muted">No responses paired.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedTx.responses.map((r) => (
                        <div key={`${r.lineNumber}-${r.timestamp}`} className="space-y-2">
                          <EventHeader event={r} />
                          <JsonOrText title="Response body" event={r} />
                          <details className="border border-border-subtle rounded-md bg-bg-base">
                            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                              Raw response line
                            </summary>
                            <div className="px-3 pb-3">
                              <Textarea
                                className="w-full text-xs font-mono min-h-[90px]"
                                value={r.rawLine}
                                readOnly
                              />
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {rawText && (
                  <details className="border border-border-subtle rounded-md bg-bg-base">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                      Raw file (preview)
                    </summary>
                    <div className="px-3 pb-3">
                      <Textarea
                        className="w-full text-xs font-mono min-h-[180px]"
                        value={rawText.slice(0, 50000)}
                        readOnly
                      />
                      {rawText.length > 50000 && (
                        <p className="text-xs text-text-muted mt-2">
                          Showing first 50,000 characters.
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

