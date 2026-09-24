'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import type { DocumentationContentSnapshot } from '@/lib/types';

export const DocumentLoadingContext = createContext<{
    branches: DocumentationContentSnapshot['branches'];
    enabled: boolean;
    load: (parentId: string, retry?: boolean) => void;
} | null>(null);

export function BranchLoader({ parentId, label = 'section' }: { parentId: string; label?: string }) {
    const context = useContext(DocumentLoadingContext);
    const target = useRef<HTMLDivElement>(null);
    const branch = context?.branches[parentId];
    const enabled = Boolean(context?.enabled);
    const load = context?.load;
    useEffect(() => {
        if (!enabled || !target.current || !branch || branch.complete || branch.status !== 'idle'
            || !load || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            let ancestor = target.current?.parentElement;
            while (ancestor) {
                if (ancestor instanceof HTMLDetailsElement && !ancestor.open) return;
                ancestor = ancestor.parentElement;
            }
            observer.disconnect();
            load(parentId);
        }, { rootMargin: '400px' });
        observer.observe(target.current);
        return () => observer.disconnect();
    }, [enabled, branch, load, parentId]);

    if (!branch || branch.complete) return null;
    return <div ref={target} className="documentation-pending" aria-label={`Pending ${label}`}>
        {branch.error ? <>
            <p role="alert">Could not load this {label}. {branch.error}</p>
            <button className="btn-secondary" type="button" disabled={!enabled} onClick={() => load?.(parentId, true)}>Retry {label}</button>
        </> : branch.status === 'loading' ? <p role="status">Loading {label}…</p>
            : <button className="btn-secondary" type="button" disabled={!enabled} onClick={() => load?.(parentId)}>Load more {label === 'document' ? 'content' : label}</button>}
    </div>;
}
