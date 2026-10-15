'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';

const RawLineContext = createContext<((start: number, end?: number) => void) | null>(null);

export function RawLineProvider({ onJump, children }: { onJump: (start: number, end?: number) => void; children: ReactNode }) {
  return <RawLineContext.Provider value={onJump}>{children}</RawLineContext.Provider>;
}

export function RawLineLink({ start, end = start }: { start: number; end?: number }) {
  const jump = useContext(RawLineContext);
  const label = end !== start ? `L${start}-${end}` : `L${start}`;
  return jump ? <Button variant="ghost" type="button" className="min-h-11 shrink-0 px-2 text-xs font-mono"
    aria-label={`Go to raw ${end !== start ? 'lines' : 'line'} ${start}${end !== start ? '-' + end : ''}`}
    onClick={() => jump(start, end)}>{label}</Button> : <span className="shrink-0 font-mono">{label}</span>;
}
