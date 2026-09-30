'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { NextDoodleIcon } from '@/components/atoms/DoodleIcons';

function JsonNode({ value, name, path, depth, comma, defaultExpanded, toggled, onToggle }: {
  value: unknown; name?: string; path: string; depth: number; comma: boolean;
  defaultExpanded: boolean; toggled: Set<string>; onToggle: (path: string) => void;
}) {
  const childrenId = useId();
  const entries = value !== null && typeof value === 'object' ? Object.entries(value) : null;
  const array = Array.isArray(value);
  const opening = array ? '[' : '{';
  const closing = array ? ']' : '}';
  const expanded = defaultExpanded !== toggled.has(path);
  const indent = '  '.repeat(depth);
  const prefix = <>{indent}{name !== undefined && <span className="text-text-primary">{JSON.stringify(name) + ': '}</span>}</>;
  const suffix = comma ? ',' : '';

  if (!entries?.length) {
    const color = typeof value === 'string' ? 'text-success'
      : typeof value === 'boolean' ? 'text-warning'
        : typeof value === 'number' ? 'text-info' : 'text-text-muted';
    return <>{prefix}<span className={color}>{JSON.stringify(value)}</span>{suffix}</>;
  }

  return (
    <>
      <span className="relative inline-block min-h-11 align-middle leading-[44px]">
        <Button
          variant="ghost" type="button" className="absolute -left-11 top-0 h-11 w-11 p-0"
          aria-label={(expanded ? 'Collapse ' : 'Expand ') + path}
          aria-expanded={expanded} aria-controls={childrenId} onClick={() => onToggle(path)}
        >
          <NextDoodleIcon size={16} className={expanded ? 'rotate-90' : undefined} />
        </Button>
        {prefix}{opening}{!expanded && <span className="text-text-muted">…</span>}{!expanded && closing}{!expanded && suffix}
      </span>
      <span id={childrenId}>{expanded && <>
        {'\n'}{entries.map(([key, child], index) => <span key={key}>
          {index > 0 && '\n'}<JsonNode value={child} name={array ? undefined : key}
            path={path + '[' + (array ? key : JSON.stringify(key)) + ']'} depth={depth + 1}
            comma={index < entries.length - 1} defaultExpanded={defaultExpanded} toggled={toggled} onToggle={onToggle}
          />
        </span>)}
        {'\n'}{indent}{closing}{suffix}
      </>}</span>
    </>
  );
}

export function FormattedJson({ value }: { value: unknown }) {
  const [folding, setFolding] = useState({ defaultExpanded: true, toggled: new Set<string>() });
  const expandable = value !== null && typeof value === 'object' && Object.keys(value).length > 0;
  const toggle = (path: string) => setFolding(current => {
    const toggled = new Set(current.toggled);
    if (toggled.has(path)) toggled.delete(path);
    else toggled.add(path);
    return { ...current, toggled };
  });

  return (
    <>
      {expandable && <div className="flex flex-wrap gap-1 px-3 pb-1">
        <Button variant="ghost" type="button" className="min-h-11 text-xs" onClick={() => setFolding({ defaultExpanded: true, toggled: new Set() })}>Expand all</Button>
        <Button variant="ghost" type="button" className="min-h-11 text-xs" onClick={() => setFolding({ defaultExpanded: false, toggled: new Set() })}>Collapse all</Button>
      </div>}
      <div className="custom-scrollbar min-w-0 overflow-x-auto px-3 pb-3">
        <pre className="m-0 w-max min-w-full whitespace-pre pl-11 font-mono text-xs leading-6 text-text-secondary">
          <code><JsonNode value={value} path="$" depth={0} comma={false} {...folding} onToggle={toggle} /></code>
        </pre>
      </div>
    </>
  );
}
