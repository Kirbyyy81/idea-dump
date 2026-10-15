'use client';

import type { LogViewerFilters } from '@/lib/types';
import type { Dispatch, SetStateAction } from 'react';
import { sourceLabels } from '@/lib/log-viewer/presentation';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';

export function LogFilters({ filters, onChange, endpoints, groupAuth, onGroupAuth, onClear }: {
  filters: LogViewerFilters; onChange: Dispatch<SetStateAction<LogViewerFilters>>; endpoints: string[];
  groupAuth: boolean; onGroupAuth: (value: boolean) => void; onClear: () => void;
}) {
  const select = (field: 'endpoint' | 'lineType' | 'status' | 'source', label: string, options: { value: string; label: string }[]) =>
    <div className="min-w-0 md:min-w-[160px]">
      <span className="mb-1 block text-xs text-text-muted">{label}</span>
      <Select value={filters[field]} onChange={value => onChange(current => ({ ...current, [field]: value, section: field === 'source' ? current.section : 'all' }))}
        className="min-w-0" buttonClassName="py-2 text-sm" ariaLabel={'Filter by ' + (field === 'lineType' ? 'line type' : field)} options={options} />
    </div>;
  return <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
    <Input label="Search" type="text" placeholder="Search endpoint / payload..." value={filters.query}
      onValueChange={query => onChange(current => ({ ...current, query }))} containerClassName="min-w-0 flex-1 md:min-w-[220px]" />
    {select('endpoint', 'Endpoint', [{ value: '', label: 'All endpoints' }, ...endpoints.map(value => ({ value, label: value }))])}
    {select('lineType', 'Line type', [{ value: '', label: 'All line types' }, ...[
      ['request', 'Requests'], ['response', 'Responses'], ['content_data', 'Content data'], ['error', 'Errors'],
      ['crash', 'Crashes'], ['info', 'Info'], ['other', 'Unparsed'],
    ].map(([value, label]) => ({ value, label }))])}
    {select('status', 'Status', [{ value: '', label: 'All statuses' }, ...[
      ['ok', 'No detected error'], ['errors', 'Errors'], ['orphans', 'All orphans'],
      ['missing-response', 'Missing response'], ['orphan-response', 'Orphan response'],
    ].map(([value, label]) => ({ value, label }))])}
    {select('source', 'Source', [{ value: '', label: 'All sources' }, ...Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))])}
    <Toggle checked={filters.errorsOnly} onChange={errorsOnly => onChange(current => ({ ...current, errorsOnly, section: 'all' }))} toggleLabel="Errors only" className="self-end" />
    <Toggle checked={groupAuth} onChange={onGroupAuth} toggleLabel="Group auth events" className="self-end" />
    <Button variant="ghost" onClick={onClear} title="Clear">Clear</Button>
  </div>;
}
