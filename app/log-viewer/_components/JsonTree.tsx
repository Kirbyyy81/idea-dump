'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import type { LogEvent } from '@/lib/log-viewer/types';

function FormattedJson({ value }: { value: unknown }) {
  const tokens = useMemo(() => {
    const formatted = JSON.stringify(value, null, 2) ?? '';
    return formatted.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g);
  }, [value]);

  return (
    <pre className="m-0 w-max min-w-full whitespace-pre font-mono text-xs leading-5 text-text-secondary">
      <code>{tokens.map((token, index) => {
        const color = /^"/.test(token)
          ? /:$/.test(token) ? 'text-text-primary' : 'text-success'
          : /^(true|false)$/.test(token) ? 'text-warning'
            : token === 'null' ? 'text-text-muted'
              : /^-?\d/.test(token) ? 'text-info' : undefined;
        return <span key={index} className={color}>{token}</span>;
      })}</code>
    </pre>
  );
}

export function JsonOrText({ title, event }: { title: string; event: LogEvent }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const id = useId();
  const bodyId = id + '-body';
  const rawId = id + '-raw';
  const rawLabel = 'Raw ' + (event.lineType === 'content_data' ? 'content data' : event.lineType) + ' line';

  return (
    <section className="min-w-0 rounded-md border border-border-subtle bg-bg-base" aria-label={title}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 px-2 py-1">
        <Button
          variant="ghost" type="button" className="min-w-0 flex-1 justify-start gap-2 text-left text-sm"
          aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <span className="font-bold">{title}</span>
        </Button>
        <Button
          variant="ghost" type="button" className="shrink-0 text-xs"
          aria-expanded={open && showRaw} aria-controls={rawId}
          onClick={() => { setOpen(true); setShowRaw(!open || !showRaw); }}
        >
          {rawLabel}
        </Button>
      </div>
      <div id={bodyId} hidden={!open} className="min-w-0">
        {open && (
          <div className="custom-scrollbar min-w-0 overflow-x-auto px-3 pb-3">
            {event.bodyKind === 'json' ? <FormattedJson value={event.bodyJson} /> : (
              <div className="space-y-2">
                {event.bodyParseError && (
                  <p className="text-xs text-error">JSON parse failed; showing extracted raw payload.</p>
                )}
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-text-primary">
                  {event.bodyRaw || '(No Body)'}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      <div id={rawId} hidden={!open || !showRaw} className="min-w-0 border-t border-border-subtle p-3">
        {open && showRaw && <Textarea
          aria-label={rawLabel}
          className="min-h-[120px] w-full min-w-0 text-xs font-mono"
          value={event.rawLine} readOnly
        />}
      </div>
    </section>
  );
}
