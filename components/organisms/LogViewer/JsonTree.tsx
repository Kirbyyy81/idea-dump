'use client';

import { LogEvent } from '@/lib/logViewer/types';

function JsonTree({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (value == null || typeof value !== 'object') {
    return <span className="break-all text-text-primary">{JSON.stringify(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <details open={depth < 2} className="min-w-0 font-mono text-xs">
        <summary className="cursor-pointer text-text-secondary">Array ({value.length})</summary>
        <div className="min-w-0 space-y-1 border-l border-border-subtle pl-4">
          {value.map((item, index) => (
            <div key={index} className="min-w-0 break-words">
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
    <details open={depth < 2} className="min-w-0 font-mono text-xs">
      <summary className="cursor-pointer text-text-secondary">Object ({entries.length})</summary>
      <div className="min-w-0 space-y-1 border-l border-border-subtle pl-4">
        {entries.map(([key, item]) => (
          <div key={key} className="min-w-0 break-words">
            <span className="break-all text-text-muted">{key}: </span>
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
    <details className="min-w-0 rounded-md border border-border-subtle bg-bg-base">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-text-muted">
          {hasJson ? 'json' : event.bodyKind === 'none' ? 'no body' : 'text'}
        </span>
      </summary>
      <div className="min-w-0 overflow-x-auto px-3 pb-3 pt-0">
        {hasJson ? (
          <JsonTree value={event.bodyJson} />
        ) : (
          <div className="space-y-2">
            {event.bodyParseError && (
              <p className="text-xs text-error">JSON parse failed; showing extracted raw payload.</p>
            )}
            <pre className="whitespace-pre-wrap break-all font-mono text-xs text-text-primary">
              {raw || '(No Body)'}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

export { JsonTree, JsonOrText };