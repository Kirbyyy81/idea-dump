'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { NextDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Textarea } from '@/components/atoms/Textarea';
import type { Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';

export function TableDumpRow({ tx, expanded, onToggle }: {
  tx: Transaction; expanded: boolean; onToggle: () => void;
}) {
  const id = useId();
  const [showRaw, setShowRaw] = useState(false);
  const timestamp = tx.responses[0].timestamp;
  return (
    <section aria-label={`Table dump ${timestamp}`} className={cn(
      'min-w-0 rounded-lg border',
      expanded ? 'border-accent-rose bg-accent-rose/10' : 'border-border-subtle bg-bg-base',
    )}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 p-2">
        <Button variant="ghost" type="button" aria-label="Table dump" aria-expanded={expanded}
          aria-controls={id + '-tables'} onClick={onToggle}
          className="min-h-11 min-w-0 flex-1 justify-start gap-2 text-left">
          <NextDoodleIcon size={16} className={expanded ? 'shrink-0 rotate-90' : 'shrink-0'} />
          <span className="min-w-0">
            <span className="block text-sm font-bold">Table dump</span>
            <span className="block break-words text-xs font-normal text-text-muted">
              {tx.tableBatch?.length} tables · {timestamp} · lines {tx.lineRefs[0]}-{tx.lineRefs.at(-1)}
            </span>
          </span>
        </Button>
        <Button variant="ghost" type="button" className="min-h-11 text-xs" aria-controls={id + '-raw'}
          aria-expanded={expanded && showRaw} onClick={() => {
            if (!expanded) onToggle();
            setShowRaw(!expanded || !showRaw);
          }}>
          Raw table dump
        </Button>
      </div>
      <div id={id + '-tables'} hidden={!expanded} className="min-w-0">
        {expanded && <div className="min-w-0 space-y-4 border-t border-border-subtle p-4">
          {tx.tableBatch?.map((table, index) => (
            <section key={index} aria-label={table.name} className="min-w-0 space-y-2">
              <h3 className="break-all text-sm font-bold">{table.name}</h3>
              {table.empty ? <p className="text-sm text-text-muted">Empty table</p> : table.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="min-w-0">
                  {table.rows.length > 1 && <h4 className="mb-1 text-xs font-bold">Row {rowIndex + 1}</h4>}
                  {row.fields ? (
                    <table aria-label={`${table.name} row ${rowIndex + 1}`} className="w-full table-fixed border-collapse text-left text-xs">
                      <thead><tr className="bg-bg-subtle">
                        <th scope="col" className="w-2/5 border border-border-subtle p-2">Field</th>
                        <th scope="col" className="border border-border-subtle p-2">Value</th>
                      </tr></thead>
                      <tbody>{row.fields.map((field, fieldIndex) => (
                        <tr key={fieldIndex}>
                          <th scope="row" className="break-all border border-border-subtle p-2 align-top font-medium">{field.name}</th>
                          <td className="whitespace-pre-wrap break-all border border-border-subtle p-2 align-top font-mono">
                            {field.value === '' ? <span className="text-text-muted">(empty)</span> : field.value}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  ) : <>
                    <p className="text-xs text-warning">Could not separate fields; showing original row.</p>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs">{row.rawText}</pre>
                  </>}
                </div>
              ))}
            </section>
          ))}
        </div>}
      </div>
      <div id={id + '-raw'} hidden={!expanded || !showRaw} className="min-w-0 border-t border-border-subtle p-3">
        {expanded && showRaw && <Textarea aria-label="Raw table dump" readOnly
          className="min-h-[160px] w-full min-w-0 font-mono text-xs"
          value={tx.responses.map((event) => event.rawLine).join('\n')} />}
      </div>
    </section>
  );
}
