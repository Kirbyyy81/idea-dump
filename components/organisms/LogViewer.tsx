'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { cn } from '@/lib/utils';
import { parseLogText } from '@/lib/logViewer/parse';
import { buildTransactions, transactionHasError } from '@/lib/logViewer/transactions';
import { LogEvent, Transaction, UnparsedLogLine } from '@/lib/logViewer/types';
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Search, Upload, X } from 'lucide-react';

function formatMsDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round((s - m * 60) * 10) / 10;
  return `${m}m ${rem}s`;
}

function JsonTree({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (value == null || typeof value !== 'object') {
    return <span className="text-text-primary">{JSON.stringify(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <details open={depth < 2} className="font-mono text-xs">
        <summary className="cursor-pointer text-text-secondary">Array ({value.length})</summary>
        <div className="pl-4 border-l border-border-subtle space-y-1">
          {value.map((item, index) => (
            <div key={index}>
              <span className="text-text-muted">{index}: </span>
              <JsonTree value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <details open={depth < 2} className="font-mono text-xs">
      <summary className="cursor-pointer text-text-secondary">Object ({entries.length})</summary>
      <div className="pl-4 border-l border-border-subtle space-y-1">
        {entries.map(([key, item]) => (
          <div key={key}>
            <span className="text-text-muted">{key}: </span>
            <JsonTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    </details>
  );
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
          <JsonTree value={event.bodyJson} />
        ) : (
          <div className="space-y-2">
            {event.bodyParseError && (
              <p className="text-xs text-error">JSON parse failed; showing extracted raw payload.</p>
            )}
            <pre className="text-xs whitespace-pre-wrap break-words font-mono text-text-primary">
              {raw || '(No Body)'}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

function EventHeader({ event }: { event: LogEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
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
        <span className="font-mono text-text-secondary">{event.endpointKey}</span>
      )}
      {event.url && (
        <span className="truncate max-w-[520px]">{event.url}</span>
      )}
      <span className="ml-auto font-mono">
        L{event.endLineNumber && event.endLineNumber !== event.lineNumber
          ? `${event.lineNumber}-${event.endLineNumber}`
          : event.lineNumber}
      </span>
    </div>
  );
}

function TransactionRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: Transaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lastResponse = tx.responses[tx.responses.length - 1];
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
        'rounded-lg border transition-colors',
        expanded
          ? 'border-accent-rose bg-accent-rose/10'
          : 'border-border-subtle bg-bg-base',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Badge
            variant={isError ? 'archived' : tx.orphanKind ? 'default' : 'complete'}
            className={cn(isError && 'border-error bg-error-bg text-error')}
            title={tx.orphanKind ? `Orphan ${tx.orphanKind}` : isError ? 'Has error' : 'No error detected'}
          >
            {statusText}
          </Badge>
          <span className="text-xs font-mono text-text-secondary">
            {tx.method ?? tx.request?.method ?? '-'}
          </span>
          <span className="truncate text-sm text-text-primary flex-1">
            {tx.endpointKey ?? tx.url ?? 'Unknown endpoint'}
          </span>
          {expanded ? (
            <ChevronDown size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>{tx.responses.length} resp</span>
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
  return (
    <div className="space-y-3 border-t border-border-subtle p-4">
      {tx.request ? (
        <div className="space-y-2">
          <EventHeader event={tx.request} />
          <JsonOrText title="Request body" event={tx.request} />
          <details className="border border-border-subtle rounded-md bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
              Raw request line
            </summary>
            <div className="px-3 pb-3">
              <Textarea
                className="w-full text-xs font-mono min-h-[90px]"
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
          <details className="border border-border-subtle rounded-md bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
              Raw content data line
            </summary>
            <div className="px-3 pb-3">
              <Textarea
                className="w-full text-xs font-mono min-h-[90px]"
                value={tx.contentData.rawLine}
                readOnly
              />
            </div>
          </details>
        </div>
      )}

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
                <details className="border border-border-subtle rounded-md bg-bg-base">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                    Raw response line
                  </summary>
                  <div className="px-3 pb-3">
                    <Textarea
                      className="w-full text-xs font-mono min-h-[90px]"
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
    </div>
  );
}

function StandaloneLines({
  unparsedLines,
  unmatchedContentData,
}: {
  unparsedLines: UnparsedLogLine[];
  unmatchedContentData: LogEvent[];
}) {
  if (unparsedLines.length === 0 && unmatchedContentData.length === 0) return null;

  return (
    <details className="rounded-lg border border-border-subtle bg-bg-base">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
        Unparsed / standalone lines ({unparsedLines.length + unmatchedContentData.length})
      </summary>
      <div className="px-3 pb-3 space-y-3">
        {unmatchedContentData.map((event) => (
          <div key={event.id} className="space-y-1">
            <EventHeader event={event} />
            <Textarea
              className="w-full text-xs font-mono min-h-[70px]"
              value={event.rawLine}
              readOnly
            />
          </div>
        ))}
        {unparsedLines.map((line) => (
          <div key={line.lineNumber} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>L{line.lineNumber}</span>
              {line.reason && <span>{line.reason}</span>}
            </div>
            <Textarea
              className="w-full text-xs font-mono min-h-[70px]"
              value={line.rawLine}
              readOnly
            />
          </div>
        ))}
      </div>
    </details>
  );
}

export function LogViewer() {
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unparsedLines, setUnparsedLines] = useState<UnparsedLogLine[]>([]);
  const [unmatchedContentData, setUnmatchedContentData] = useState<LogEvent[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(true);
  const [isAutoParsing, setIsAutoParsing] = useState(false);
  const [autoParseSource, setAutoParseSource] = useState<string>('Pasted log');

  const [query, setQuery] = useState<string>('');
  const [errorsOnly, setErrorsOnly] = useState<boolean>(false);
  const [endpointFilter, setEndpointFilter] = useState<string>('');

  const indexed = useMemo(() => {
    return transactions.map((tx) => {
      const searchParts: string[] = [];
      if (tx.endpointKey) searchParts.push(tx.endpointKey);
      if (tx.url) searchParts.push(tx.url);
      if (tx.contentData?.bodyRaw) searchParts.push(tx.contentData.bodyRaw);
      if (tx.contentData?.rawLine) searchParts.push(tx.contentData.rawLine);
      if (tx.request?.bodyRaw) searchParts.push(tx.request.bodyRaw);
      if (tx.request?.rawLine) searchParts.push(tx.request.rawLine);
      for (const response of tx.responses) {
        if (response.bodyRaw) searchParts.push(response.bodyRaw);
        if (response.rawLine) searchParts.push(response.rawLine);
      }
      return { tx, searchText: searchParts.join('\n').toLowerCase() };
    });
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return indexed
      .filter(({ tx, searchText }) => {
        if (errorsOnly && !transactionHasError(tx)) return false;
        if (endpointFilter && (tx.endpointKey ?? tx.url ?? '') !== endpointFilter) return false;
        if (!q) return true;
        return searchText.includes(q);
      })
      .map(({ tx }) => tx);
  }, [indexed, query, errorsOnly, endpointFilter]);

  const endpointOptions = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .map((tx) => tx.endpointKey ?? tx.url)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const hasParsedOutput =
    transactions.length > 0 || unparsedLines.length > 0 || unmatchedContentData.length > 0;

  const processText = useCallback((text: string, sourceName: string, syncRawText = true) => {
    if (syncRawText) setRawText(text);
    const parsedEvents = parseLogText(text);
    setEvents(parsedEvents);
    const {
      transactions: txs,
      unparsedLines: nextUnparsedLines,
      unmatchedContentData: nextUnmatchedContentData,
    } = buildTransactions(parsedEvents, {
      inactivityTimeoutMs: 0,
    });
    setTransactions(txs);
    setUnparsedLines(nextUnparsedLines);
    setUnmatchedContentData(nextUnmatchedContentData);
    setSelectedTxId(txs[0]?.id ?? null);
    setIsImportOpen(txs.length === 0 && nextUnparsedLines.length === 0 && nextUnmatchedContentData.length === 0);
    setEndpointFilter('');
  }, []);

  const clearParsedState = useCallback(() => {
    setEvents([]);
    setTransactions([]);
    setUnparsedLines([]);
    setUnmatchedContentData([]);
    setSelectedTxId(null);
    setIsImportOpen(true);
    setEndpointFilter('');
  }, []);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setAutoParseSource(file.name);
    processText(text, file.name);
  };

  useEffect(() => {
    const trimmed = rawText.trim();

    if (!trimmed) {
      clearParsedState();
      setIsAutoParsing(false);
      return;
    }

    setIsAutoParsing(true);
    const timer = window.setTimeout(() => {
      processText(rawText, autoParseSource, false);
      setFileName(autoParseSource);
      setIsAutoParsing(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [rawText, autoParseSource, clearParsedState, processText]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setIsImportOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
          aria-expanded={isImportOpen}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={20} className="shrink-0 text-accent-rose" />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold font-body text-text-primary">
                Import Logs
              </h2>
              {!isImportOpen && (
                <p className="truncate text-xs text-text-muted">
                  {fileName || autoParseSource}
                  {rawText ? ` - ${rawText.length.toLocaleString()} characters` : ''}
                </p>
              )}
            </div>
          </div>
          {isImportOpen ? (
            <ChevronDown size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
          )}
        </button>

        {isImportOpen && (
          <div className="border-t border-border-subtle px-6 pb-6 pt-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-medium text-text-primary" htmlFor="log-viewer-raw-input">
                Paste raw log text
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {fileName && fileName !== 'Pasted log' && (
                  <span className="max-w-[220px] truncate text-xs text-text-muted">
                    {fileName}
                  </span>
                )}
                <label
                  htmlFor="log-viewer-file-input"
                  className="btn-secondary inline-flex cursor-pointer items-center"
                >
                  <Upload size={16} className="mr-2" />
                  Upload .txt/.log
                </label>
                <input
                  id="log-viewer-file-input"
                  type="file"
                  accept=".txt,.log,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                  className="sr-only"
                />
              </div>
            </div>
            <Textarea
              id="log-viewer-raw-input"
              className="min-h-[180px] w-full text-xs font-mono"
              value={rawText}
              onChange={(e) => {
                const nextText = e.target.value;
                setRawText(nextText);
                if (fileName && fileName !== 'Pasted log') setFileName('');
                setAutoParseSource('Pasted log');
              }}
              placeholder="Paste raw API logs here..."
            />
            {isAutoParsing && (
              <div className="mt-3 text-right text-xs text-text-muted">Parsing...</div>
            )}
          </div>
        )}
      </Card>

      {hasParsedOutput && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs text-text-muted">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input
                  type="text"
                  placeholder="Search endpoint / payload..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-7 text-sm"
                />
              </div>
            </div>

            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-text-muted">Endpoint</label>
              <select
                value={endpointFilter}
                onChange={(e) => setEndpointFilter(e.target.value)}
                className="input py-2 text-sm"
                title="Filter by endpoint"
              >
                <option value="">All endpoints</option>
                {endpointOptions.map((endpoint) => (
                  <option key={endpoint} value={endpoint}>
                    {endpoint}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex h-10 items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              Errors only
            </label>

            <Button
              variant="ghost"
              onClick={() => {
                setFileName('');
                setRawText('');
                clearParsedState();
                setQuery('');
                setErrorsOnly(false);
              }}
              icon={<X size={16} />}
              title="Clear"
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {!hasParsedOutput ? (
        <Card className="p-12 text-center">
          <p className="text-text-muted">Upload a log file or paste raw log text to begin.</p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold font-body text-text-primary">Logs</h2>
            <span className="text-xs text-text-muted">
              {filteredTransactions.length} / {transactions.length}
            </span>
          </div>

          <div className="space-y-3">
            {filteredTransactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                expanded={tx.id === selectedTxId}
                onToggle={() =>
                  setSelectedTxId((current) => (current === tx.id ? null : tx.id))
                }
              />
            ))}

            {filteredTransactions.length === 0 && (
              <p className="rounded-lg border border-border-subtle bg-bg-base p-4 text-sm text-text-muted">
                No logs match the current filters.
              </p>
            )}

            <StandaloneLines
              unparsedLines={unparsedLines}
              unmatchedContentData={unmatchedContentData}
            />

            {rawText && (
              <details className="rounded-lg border border-border-subtle bg-bg-base">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                  Raw input preview
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
        </Card>
      )}
    </div>
  );
}
