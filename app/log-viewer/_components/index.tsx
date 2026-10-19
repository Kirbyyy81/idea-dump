'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/atoms/Button';
import { NextDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Card } from '@/components/atoms/Card';
import { Textarea } from '@/components/atoms/Textarea';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions, eventHasError, transactionHasError } from '@/lib/log-viewer/transactions';
import { eventMatches, groupUnparsedLines, timelineRows, transactionMatches, unparsedMatches } from '@/lib/log-viewer/presentation';
import type { LogEvent, LogViewerFilters, Transaction, UnparsedLogLine } from '@/lib/types';
import { FileText, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { StandaloneLines } from './StandaloneLines';
import { LogFilters } from './LogFilters';
import { LogTimeline } from './LogTimeline';
import { RawLineProvider } from './RawLineLink';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const INITIAL_FILTERS: LogViewerFilters = { query: '', errorsOnly: false, endpoint: '', lineType: '', status: '', source: '', section: 'all' };

export function LogViewer() {
  const rawInputRef = useRef<HTMLTextAreaElement>(null);
  const fileReadId = useRef(0);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [lastParsedRawText, setLastParsedRawText] = useState('');
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unparsedLines, setUnparsedLines] = useState<UnparsedLogLine[]>([]);
  const [unmatchedContentData, setUnmatchedContentData] = useState<LogEvent[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(true);
  const [isAutoParsing, setIsAutoParsing] = useState(false);
  const [importError, setImportError] = useState('');
  const [lineAnnouncement, setLineAnnouncement] = useState('');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [groupAuth, setGroupAuth] = useState(false);

  const filteredTransactions = useMemo(() => transactions.filter(tx => transactionMatches(tx, filters)), [transactions, filters]);
  const filteredContent = useMemo(() => filters.section === 'unparsed' ? []
    : unmatchedContentData.filter(event => eventMatches(event, filters)), [unmatchedContentData, filters]);
  const filteredUnparsed = useMemo(() => groupUnparsedLines(unparsedLines).filter(line => unparsedMatches(line, filters)), [unparsedLines, filters]);
  const rows = useMemo(() => timelineRows(transactions, new Set(filteredTransactions.map(tx => tx.id)), groupAuth, events), [transactions, filteredTransactions, groupAuth, events]);
  const endpointOptions = useMemo(() => [...new Set([
    ...transactions.map(tx => tx.endpointKey ?? tx.url),
    ...unmatchedContentData.map(event => event.endpointKey ?? event.functionName ?? event.url),
  ].filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [transactions, unmatchedContentData]);

  const hasParsedOutput = transactions.length > 0 || unparsedLines.length > 0 || unmatchedContentData.length > 0;
  const summary = [
    { label: 'Events', value: events.length },
    { label: 'Transactions', value: transactions.length },
    { label: 'Errors', value: transactions.filter(transactionHasError).length + unmatchedContentData.filter(eventHasError).length, status: 'errors' },
    { label: 'Orphans', value: transactions.filter(tx => tx.orphanKind).length, status: 'orphans' },
    { label: 'Unmatched content', value: unmatchedContentData.length, section: 'unmatched' as const },
    { label: 'Unparsed', value: unparsedLines.reduce((count, line) => count + (line.endLineNumber ?? line.lineNumber) - line.lineNumber + 1, 0), section: 'unparsed' as const },
  ];

  const processText = useCallback((text: string) => {
    setLastParsedRawText(text);
    const parsed = parseLogText(text);
    const result = buildTransactions(parsed, { inactivityTimeoutMs: 0 });
    setEvents(parsed);
    setTransactions(result.transactions);
    setUnparsedLines(result.unparsedLines);
    setUnmatchedContentData(result.unmatchedContentData);
    setSelectedTxId(result.transactions[0]?.id ?? null);
    setIsImportOpen(!parsed.length);
    setFilters(current => ({ ...INITIAL_FILTERS, query: current.query, errorsOnly: current.errorsOnly }));
    setIsAutoParsing(false);
  }, []);

  const clearParsedState = useCallback(() => {
    setLastParsedRawText(''); setEvents([]); setTransactions([]); setUnparsedLines([]);
    setUnmatchedContentData([]); setSelectedTxId(null); setIsImportOpen(true); setIsAutoParsing(false);
  }, []);

  const handleFile = async (file: File) => {
    const readId = ++fileReadId.current;
    setImportError('');
    if (file.size > MAX_FILE_BYTES) { setImportError('Choose a log file of 10 MB or smaller.'); return; }
    try {
      const text = await file.text();
      if (readId !== fileReadId.current) return;
      clearParsedState(); setRawText(text); setFileName(file.name);
      processText(text);
    } catch {
      if (readId === fileReadId.current) setImportError('Could not read this log file. Try again.');
    }
  };

  const returnToImport = () => {
    flushSync(() => setIsImportOpen(true));
    rawInputRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const jumpToLine = (start: number, end = start) => {
    returnToImport();
    const input = rawInputRef.current;
    if (!input) return;
    let offset = 0;
    for (let line = 1; line < start; line++) {
      const next = rawText.indexOf('\n', offset);
      if (next < 0) break;
      offset = next + 1;
    }
    let finish = offset;
    for (let line = start; line <= end; line++) {
      const next = rawText.indexOf('\n', finish);
      if (next < 0) { finish = rawText.length; break; }
      finish = line === end ? next : next + 1;
    }
    input.setSelectionRange(offset, finish);
    input.scrollTop = Math.max(0, (start - 2) * (parseFloat(getComputedStyle(input).lineHeight) || 18));
    setLineAnnouncement('Selected raw ' + (start === end ? 'line ' + start : 'lines ' + start + '-' + end) + '.');
  };

  const navigateToTransaction = (id: string) => {
    flushSync(() => { setFilters(INITIAL_FILTERS); setGroupAuth(false); setSelectedTxId(id); });
    const target = document.getElementById('log-' + id);
    target?.scrollIntoView({ block: 'center' });
    target?.querySelector('button')?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!rawText.trim()) { clearParsedState(); return; }
    if (rawText === lastParsedRawText) { setIsAutoParsing(false); return; }
    setIsAutoParsing(true);
    const timer = window.setTimeout(() => processText(rawText), 250);
    return () => window.clearTimeout(timer);
  }, [rawText, lastParsedRawText, processText, clearParsedState]);

  const noMatches = !filteredTransactions.length && !filteredContent.length && !filteredUnparsed.length;
  return <RawLineProvider onJump={jumpToLine}>
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden pb-20">
      <Card className="min-w-0 max-w-full p-0">
        <button type="button" onClick={() => setIsImportOpen(current => !current)}
          className="flex w-full min-w-0 items-center justify-between gap-4 px-6 py-4 text-left" aria-expanded={isImportOpen}>
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={20} className="shrink-0 text-accent-rose" />
            <div className="min-w-0"><h2 className="text-lg font-bold font-body text-text-primary">Import Logs</h2>
              {!isImportOpen && <p className="truncate text-xs text-text-muted">{fileName || 'Pasted log'} - {rawText.length.toLocaleString()} characters</p>}
            </div>
          </div>
          {isImportOpen ? <ChevronDown size={18} className="shrink-0 text-text-muted" /> : <ChevronRight size={18} className="shrink-0 text-text-muted" />}
        </button>
        {isImportOpen && <div className="min-w-0 border-t border-border-subtle px-6 pb-6 pt-4">
          <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-medium text-text-primary" htmlFor="log-viewer-raw-input">Paste raw log text</label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {fileName && <span className="max-w-[220px] truncate text-xs text-text-muted">{fileName}</span>}
              <label htmlFor="log-viewer-file-input" className="btn-secondary inline-flex cursor-pointer items-center"><Upload size={16} className="mr-2" />Upload .txt/.log</label>
              <input id="log-viewer-file-input" type="file" accept=".txt,.log,text/plain" className="sr-only" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (file) void handleFile(file);
              }} />
            </div>
          </div>
          <Textarea ref={rawInputRef} id="log-viewer-raw-input" wrap="off" className="min-h-[180px] w-full min-w-0 text-xs font-mono"
            aria-label="Paste raw log text" value={rawText} placeholder="Paste raw API logs here..." onChange={event => {
              ++fileReadId.current; setImportError(''); setLineAnnouncement(''); setFileName('');
              const text = event.target.value;
              setRawText(text);
            }} />
          <p role="status" className="sr-only">{lineAnnouncement}</p>
          {importError && <p role="alert" className="mt-2 text-sm text-error">{importError}</p>}
          {isAutoParsing && <div className="mt-3 text-right text-xs text-text-muted">Parsing...</div>}
        </div>}
      </Card>

      {hasParsedOutput && <>
        <Card className="min-w-0 max-w-full p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {summary.map(item => {
            const content = <><span className="block text-xs text-text-muted">{item.label}</span><span className="mt-1 block font-mono text-lg font-bold text-text-primary">{item.value.toLocaleString()}</span></>;
            const active = item.status ? filters.status === item.status : item.section ? filters.section === item.section : false;
            return item.status || item.section ? <Button key={item.label} type="button" variant="ghost" aria-label={'Filter ' + item.label.toLowerCase()}
              aria-pressed={active} className={cn('block rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-left', active && 'border-accent-rose bg-accent-rose/10')}
              onClick={() => setFilters(current => ({ ...current, section: active ? 'all' : item.section ?? 'all',
                status: active ? '' : item.status ?? '', errorsOnly: false, lineType: '', endpoint: '' }))}>{content}</Button>
              : <div key={item.label} className="rounded-md border border-border-subtle bg-bg-base px-3 py-2">{content}</div>;
          })}
        </div></Card>
        <Card className="min-w-0 max-w-full p-4">
          <LogFilters filters={filters} onChange={setFilters} endpoints={endpointOptions} groupAuth={groupAuth} onGroupAuth={setGroupAuth} onClear={() => {
            ++fileReadId.current; setFileName(''); setRawText(''); clearParsedState(); setFilters(INITIAL_FILTERS); setImportError(''); setLineAnnouncement('');
          }} />
        </Card>
      </>}

      {!hasParsedOutput ? <Card className="min-w-0 max-w-full p-12 text-center"><p className="text-text-muted">
        Upload a log file or paste raw log text to begin.
      </p></Card> : <Card className="min-w-0 max-w-full p-6">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3"><h2 className="text-lg font-bold font-body text-text-primary">Logs</h2>
          <span className="text-xs text-text-muted">{filteredTransactions.length} / {transactions.length}</span>
        </div>
        <div className="min-w-0 space-y-3">
          <LogTimeline rows={rows} transactions={transactions} selected={selectedTxId}
            onSelect={id => setSelectedTxId(current => current === id ? null : id)} onNavigate={navigateToTransaction} />
          {noMatches && <p className="rounded-lg border border-border-subtle bg-bg-base p-4 text-sm text-text-muted">No logs match the current filters.</p>}
          <StandaloneLines unparsedLines={filteredUnparsed} unmatchedContentData={filteredContent}
            open={Boolean(filters.query.trim() || filters.section !== 'all')} />
          <details className="min-w-0 rounded-lg border border-border-subtle bg-bg-base">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">Raw input preview</summary>
            <div className="min-w-0 px-3 pb-3"><Textarea className="min-h-[180px] w-full min-w-0 text-xs font-mono" value={rawText.slice(0, 50000)} readOnly />
              {rawText.length > 50000 && <p className="mt-2 text-xs text-text-muted">Showing first 50,000 characters. Use a line link to select a record in the full input.</p>}
            </div>
          </details>
        </div>
      </Card>}
      <Button type="button" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-20 h-12 w-12 rounded-full p-0"
        aria-label="Back to log input" title="Back to log input" onClick={returnToImport}><NextDoodleIcon className="-rotate-90" /></Button>
    </div>
  </RawLineProvider>;
}
