'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Input } from '@/components/atoms/Input';
import { requestApi } from '@/lib/api/client';
import { DocumentContentLoader, isDocumentAccessError } from '@/lib/documentation/core/loader';
import type { DocumentationContentSnapshot, DocumentationPage, DocumentationTreeBlock } from '@/lib/types';
import { DocumentBlocks } from './DocumentBlocks';
import { BranchLoader, DocumentLoadingContext } from './DocumentLoading';
import '../documentation.css';

function headings(blocks: DocumentationTreeBlock[]): DocumentationTreeBlock[] {
    const result: DocumentationTreeBlock[] = [];
    const visit = (items: DocumentationTreeBlock[]) => {
        for (const block of items) {
            if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) result.push(block);
            if (block.type !== 'child_page') visit(block.children);
        }
    };
    visit(blocks);
    return result;
}

function versionsPage(blocks: DocumentationTreeBlock[]): string | null {
    const page = blocks.find((block) => block.type === 'child_page' && block.title?.trim().toLowerCase() === 'versions');
    return page ? `https://www.notion.so/${page.id.replace(/-/g, '')}` : null;
}

const EMPTY_CONTENT: DocumentationContentSnapshot = { blocks: [], branches: {}, count: 0, complete: false, failures: 0, outlineComplete: false, outlineFailures: 0 };

export function DocumentReader({ pageId, initialQuery }: { pageId: string; initialQuery: string }) {
    const [metadata, setMetadata] = useState<DocumentationPage | null>(null);
    const [content, setContent] = useState(EMPTY_CONTENT);
    const blocks = content.blocks;
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);
    const [query, setQuery] = useState(initialQuery);
    const [matchIds, setMatchIds] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const controller = useRef<AbortController | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const loaded = useRef(false);
    const session = useRef<DocumentContentLoader | null>(null);
    const [sessionEpoch, setSessionEpoch] = useState(0);
    const queryRef = useRef(query);
    queryRef.current = query;
    const activeId = matchIds[activeIndex] || null;
    const activeMatchRef = useRef(activeId);
    activeMatchRef.current = activeId;
    const previousQuery = useRef(query);

    async function fetchCurrent() {
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setError('');
        if (loaded.current) setRefreshing(true);
        else setLoading(true);
        const invalidate = (cause: unknown) => {
            if (abort.signal.aborted) return;
            abort.abort();
            setMetadata(null);
            setContent(EMPTY_CONTENT);
            loaded.current = false;
            setStale(false);
            setLoading(false);
            setRefreshing(false);
            setError(cause instanceof Error ? cause.message : 'Document access is unavailable.');
        };
        try {
            const freshMetadata = await requestApi<DocumentationPage>(`/api/documentation/${pageId}`, { cache: 'no-store', signal: abort.signal });
            if (abort.signal.aborted) return;
            if (!loaded.current) setMetadata(freshMetadata);
            const loader = new DocumentContentLoader(pageId, abort.signal, (snapshot) => {
                if (abort.signal.aborted) return;
                if (!loaded.current || snapshot.branches[pageId]?.hasLoaded) setContent(snapshot);
                if (snapshot.branches[pageId]?.hasLoaded) {
                    setMetadata(freshMetadata);
                    setStale(false);
                    loaded.current = true;
                }
            }, invalidate);
            session.current = loader;
            setSessionEpoch((value) => value + 1);
            await loader.loadNext(pageId);
            if (abort.signal.aborted) return;
            const root = loader.snapshot().branches[pageId];
            if (loaded.current && !root.hasLoaded && root.error) throw new Error(root.error);
            void loader.loadOutline().catch(() => {});
        } catch (cause) {
            if (abort.signal.aborted) return;
            if (isDocumentAccessError(cause)) { invalidate(cause); return; }
            if (loaded.current) setStale(true);
            setError(cause instanceof Error ? cause.message : 'Could not load the document.');
        } finally {
            if (!abort.signal.aborted) { setLoading(false); setRefreshing(false); }
        }
    }

    useEffect(() => {
        fetchCurrent();
        return () => { controller.current?.abort(); loaded.current = false; };
        // A different page mounts a new reader.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageId]);

    useEffect(() => {
        if (!query.trim() || refreshing || stale) return;
        let active = true;
        const loader = session.current;
        void loader?.loadAll(() => active).catch(() => {});
        return () => { active = false; };
    }, [query, sessionEpoch, refreshing, stale]);

    const loadBranch = useCallback((parentId: string, retry = false) => {
        if (refreshing || stale) return;
        const loader = session.current;
        void loader?.loadNext(parentId, retry).then(() => {
            return queryRef.current.trim() ? loader.loadAll(() => Boolean(queryRef.current.trim())) : loader.loadOutline();
        }).catch(() => {});
    }, [refreshing, stale]);

    const retrySearch = () => {
        const loader = session.current;
        void loader?.retryFailed().then(() => loader.loadAll(() => Boolean(queryRef.current.trim()))).catch(() => {});
    };

    const retryOutline = () => {
        const loader = session.current;
        void loader?.retryOutline().then(() => {
            if (queryRef.current.trim()) return loader.loadAll(() => Boolean(queryRef.current.trim()));
        }).catch(() => {});
    };

    useEffect(() => {
        const marks = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-doc-match]') || []);
        const ids = marks.map((mark) => mark.dataset.docMatch || '').filter(Boolean);
        setMatchIds(ids);
        setActiveIndex(previousQuery.current === query && activeMatchRef.current
            ? Math.max(0, ids.indexOf(activeMatchRef.current)) : 0);
        previousQuery.current = query;
    }, [blocks, query]);

    useEffect(() => {
        if (!activeId) return;
        const mark = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-doc-match]') || [])
            .find((item) => item.dataset.docMatch === activeId);
        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [activeId]);

    const sections = useMemo(() => headings(blocks), [blocks]);
    const versions = useMemo(() => versionsPage(blocks), [blocks]);
    const move = (offset: number) => setActiveIndex((current) => (current + offset + matchIds.length) % matchIds.length);

    return <AppShell pageTitle="Documentation">
        <div className="documentation-reader">
            <Link href="/documentation" className="documentation-back"><ArrowLeft size={16} /> All documents</Link>
            {metadata && <header className="documentation-document-header">
                <div className="documentation-kicker">{metadata.type || 'Document'} {metadata.version && <span> · {metadata.version}</span>}</div>
                <h1>{metadata.title}</h1>
                <div className="documentation-actions">
                    <button className="btn-secondary" type="button" onClick={fetchCurrent} disabled={refreshing}><RefreshCw size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
                    <a className="btn-secondary" href={metadata.notionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open in Notion</a>
                    {versions && <a className="btn-secondary" href={versions} target="_blank" rel="noopener noreferrer">Versions</a>}
                </div>
            </header>}
            {(loading || refreshing) && <p role="status">{refreshing ? 'Refreshing' : 'Loading'} document…</p>}
            {error && <div className="documentation-notice" role="alert">{error} {stale && <strong>Showing the last loaded copy.</strong>} <button className="btn-secondary" type="button" onClick={fetchCurrent}>Retry</button></div>}
            {metadata && <div className="documentation-reader-grid">
                {(sections.length > 0 || !content.outlineComplete) && <nav className="documentation-toc" aria-label="On this page">
                    <strong>On this page</strong>
                    {!content.outlineComplete && <small role="status">{stale ? 'Showing previously loaded sections.' : content.outlineFailures ? 'Some sections could not be listed.' : 'Loading table of contents…'}</small>}
                    {content.outlineFailures > 0 && !stale && <button className="btn-secondary" type="button" disabled={refreshing} onClick={retryOutline}>Retry contents</button>}
                    {sections.map((section) => <a key={section.id} href={`#section-${section.id}`} className={`documentation-toc-${section.type}`} onClick={() => {
                        let ancestor = document.getElementById(`section-${section.id}`)?.parentElement;
                        while (ancestor) {
                            if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
                            ancestor = ancestor.parentElement;
                        }
                    }}>{section.richText.map((part) => part.text).join('')}</a>)}
                </nav>}
                <article className="documentation-paper">
                    <div className="documentation-find">
                        <Input aria-label="Find in this document" placeholder="Find in this document" value={query} maxLength={120} onValueChange={setQuery} onKeyDown={(event) => {
                            if (event.key === 'Enter' && matchIds.length) { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
                            if (event.key === 'Escape') setQuery('');
                        }} />
                        {query && <span role="status">{matchIds.length ? `${activeIndex + 1} of ${matchIds.length}${content.complete ? '' : ' so far'}` : content.complete ? 'No matches' : 'No matches yet'}</span>}
                        <button className="btn-secondary" type="button" onClick={() => move(-1)} disabled={!matchIds.length} aria-label="Previous match"><ChevronUp size={16} /></button>
                        <button className="btn-secondary" type="button" onClick={() => move(1)} disabled={!matchIds.length} aria-label="Next match"><ChevronDown size={16} /></button>
                    </div>
                    {query.trim() && !content.complete && <div className="documentation-search-status" role="status">
                        {stale ? 'Search is limited to the last loaded content. Refresh to search the current document.'
                            : content.failures ? 'Search incomplete. Some sections could not be checked.' : 'Searching remaining sections…'}
                        {content.failures > 0 && !stale && <button className="btn-secondary" type="button" onClick={retrySearch} disabled={refreshing}>Retry search</button>}
                    </div>}
                    <DocumentLoadingContext.Provider value={{ branches: content.branches, enabled: !refreshing && !stale && (content.outlineComplete || content.outlineFailures > 0), load: loadBranch }}>
                        <div ref={contentRef}><DocumentBlocks blocks={blocks} query={query} activeId={activeId} /></div>
                        <BranchLoader parentId={pageId} label="document" />
                    </DocumentLoadingContext.Provider>
                    {!blocks.length && content.complete && !loading && <p>This document has no page content.</p>}
                </article>
            </div>}
        </div>
    </AppShell>;
}
