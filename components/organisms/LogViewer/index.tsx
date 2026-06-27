'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { parseLogText } from '@/lib/logViewer/parse';
import { buildTransactions, transactionHasError } from '@/lib/logViewer/transactions';
import { LogEvent, Transaction, UnparsedLogLine } from '@/lib/logViewer/types';
import { FileText, ChevronDown, ChevronRight, Search, Upload, X } from 'lucide-react';
import { TransactionRow } from './TransactionDisplay';
import { StandaloneLines } from './StandaloneLines';

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
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <Card className="min-w-0 max-w-full p-0">
        <button
          type="button"
          onClick={() => setIsImportOpen((current) => !current)}
          className="flex w-full min-w-0 items-center justify-between gap-4 px-6 py-4 text-left"
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
          <div className="min-w-0 border-t border-border-subtle px-6 pb-6 pt-4">
            <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-medium text-text-primary" htmlFor="log-viewer-raw-input">
                Paste raw log text
              </label>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
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
              className="min-h-[180px] w-full min-w-0 text-xs font-mono"
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
        <Card className="min-w-0 max-w-full p-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-0 flex-1 md:min-w-[220px]">
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

            <div className="min-w-0 md:min-w-[220px]">
              <label className="mb-1 block text-xs text-text-muted">Endpoint</label>
              <select
                value={endpointFilter}
                onChange={(e) => setEndpointFilter(e.target.value)}
                className="input w-full min-w-0 py-2 text-sm"
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
        <Card className="min-w-0 max-w-full p-12 text-center">
          <p className="text-text-muted">Upload a log file or paste raw log text to begin.</p>
        </Card>
      ) : (
        <Card className="min-w-0 max-w-full p-6">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="text-xl font-semibold font-body text-text-primary">Logs</h2>
            <span className="text-xs text-text-muted">
              {filteredTransactions.length} / {transactions.length}
            </span>
          </div>

          <div className="min-w-0 space-y-3">
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
              <details className="min-w-0 rounded-lg border border-border-subtle bg-bg-base">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                  Raw input preview
                </summary>
                <div className="min-w-0 px-3 pb-3">
                  <Textarea
                    className="min-h-[180px] w-full min-w-0 text-xs font-mono"
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