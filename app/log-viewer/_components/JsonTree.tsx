'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { NextDoodleIcon } from '@/components/atoms/DoodleIcons';
import { Textarea } from '@/components/atoms/Textarea';
import type { LogEvent } from '@/lib/log-viewer/types';
import { FormattedJson } from './FormattedJson';

function CopyJsonButton({ value, label }: { value: unknown; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => { setStatus('idle'); }, [value]);
  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  };

  return <>
    <Button variant="ghost" type="button" className="min-h-11 shrink-0 text-xs" aria-label={label} onClick={copy}>
      {status === 'copied' ? 'Copied' : 'Copy JSON'}
    </Button>
    <span role="status" className={status === 'error' ? 'w-full px-3 text-xs text-error' : 'sr-only'}>
      {status === 'copied' ? 'JSON copied.' : status === 'error' ? 'Could not copy JSON. Check clipboard permissions and try again.' : ''}
    </span>
  </>;
}

export function JsonOrText({ title, event }: { title: string; event: LogEvent }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const id = useId();
  const bodyId = id + '-body';
  const rawId = id + '-raw';
  const recordLabel = event.lineType === 'content_data' ? 'content data' : event.lineType;
  const rawLabel = 'Raw ' + recordLabel + ' line';

  return (
    <section className="min-w-0 rounded-md border border-border-subtle bg-bg-base" aria-label={title}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 px-2 py-1">
        <Button
          variant="ghost" type="button" className="min-h-11 min-w-0 basis-full justify-start gap-2 text-left text-sm sm:basis-auto sm:flex-1"
          aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}
        >
          <NextDoodleIcon size={16} className={open ? 'shrink-0 rotate-90' : 'shrink-0'} />
          <span className="font-bold">{title}</span>
        </Button>
        <Button
          variant="ghost" type="button" className="min-h-11 shrink-0 text-xs"
          aria-expanded={open && showRaw} aria-controls={rawId}
          onClick={() => { setOpen(true); setShowRaw(!open || !showRaw); }}
        >
          {rawLabel}
        </Button>
        {event.bodyKind === 'json' && <CopyJsonButton value={event.bodyJson} label={'Copy ' + recordLabel + ' JSON'} />}
      </div>
      <div id={bodyId} hidden={!open} className="min-w-0">
        {open && (
          <>
            {event.bodyKind === 'json' ? <FormattedJson value={event.bodyJson} /> : (
              <div className="custom-scrollbar min-w-0 space-y-2 overflow-x-auto px-3 pb-3">
                {event.bodyParseError && (
                  <p className="text-xs text-error">JSON parse failed; showing extracted raw payload.</p>
                )}
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-text-primary">
                  {event.bodyRaw || '(No Body)'}
                </pre>
              </div>
            )}
          </>
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
