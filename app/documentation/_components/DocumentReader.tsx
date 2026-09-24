'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Input } from '@/components/atoms/Input';
import { ApiClientError, requestApi } from '@/lib/api/client';
import { loadDocumentTree } from '@/lib/documentation/core/content';
import type { DocumentationPage, DocumentationTreeBlock } from '@/lib/types';
import { DocumentBlocks } from './DocumentBlocks';
import '../documentation.css';

function dateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Unknown' : new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

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

export function DocumentReader({ pageId, initialQuery }: { pageId: string; initialQuery: string }) {
    const [metadata, setMetadata] = useState<DocumentationPage | null>(null);
    const [blocks, setBlocks] = useState<DocumentationTreeBlock[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);
    const [fetchedAt, setFetchedAt] = useState('');
    const [query, setQuery] = useState(initialQuery);
    const [matchIds, setMatchIds] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const controller = useRef<AbortController | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const loaded = useRef(false);

    async function fetchCurrent() {
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setError('');
        setProgress(0);
        if (loaded.current) setRefreshing(true);
        else setLoading(true);
        try {
            const freshMetadata = await requestApi<DocumentationPage>(`/api/documentation/${pageId}`, { cache: 'no-store', signal: abort.signal });
            const freshBlocks = await loadDocumentTree(pageId, abort.signal, (count) => {
                if (!abort.signal.aborted) setProgress(count);
            });
            if (abort.signal.aborted) return;
            setMetadata(freshMetadata);
            setBlocks(freshBlocks);
            setFetchedAt(new Date().toISOString());
            setStale(false);
            loaded.current = true;
        } catch (cause) {
            if (abort.signal.aborted) return;
            const invalidated = cause instanceof ApiClientError && [401, 403, 404].includes(cause.status);
            if (invalidated) {
                setMetadata(null);
                setBlocks([]);
                loaded.current = false;
                setStale(false);
            } else if (loaded.current) setStale(true);
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
        const marks = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-doc-match]') || []);
        setMatchIds(marks.map((mark) => mark.dataset.docMatch || '').filter(Boolean));
        setActiveIndex(0);
    }, [blocks, query]);

    useEffect(() => {
        const id = matchIds[activeIndex];
        if (!id) return;
        const mark = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-doc-match]') || [])
            .find((item) => item.dataset.docMatch === id);
        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [matchIds, activeIndex]);

    const sections = useMemo(() => headings(blocks), [blocks]);
    const versions = useMemo(() => versionsPage(blocks), [blocks]);
    const activeId = matchIds[activeIndex] || null;
    const move = (offset: number) => setActiveIndex((current) => (current + offset + matchIds.length) % matchIds.length);

    return <AppShell pageTitle="Documentation">
        <div className="documentation-reader">
            <Link href="/documentation" className="documentation-back"><ArrowLeft size={16} /> All documents</Link>
            {metadata && <header className="documentation-document-header">
                <div className="documentation-kicker">{metadata.type || 'Document'} {metadata.version && <span> · {metadata.version}</span>}</div>
                <h1>{metadata.title}</h1>
                <div className="documentation-meta">
                    <span>Edited {dateTime(metadata.lastEditedTime)}</span>
                    {fetchedAt && <span>Fetched {dateTime(fetchedAt)}</span>}
                </div>
                <div className="documentation-actions">
                    <button className="btn-secondary" type="button" onClick={fetchCurrent} disabled={refreshing}><RefreshCw size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
                    <a className="btn-secondary" href={metadata.notionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open in Notion</a>
                    {versions && <a className="btn-secondary" href={versions} target="_blank" rel="noopener noreferrer">Versions</a>}
                </div>
            </header>}
            {(loading || refreshing) && <p role="status">{refreshing ? 'Refreshing' : 'Loading'} document… {progress > 0 ? `${progress} blocks loaded` : ''}</p>}
            {error && <div className="documentation-notice" role="alert">{error} {stale && <strong>Showing the last loaded copy.</strong>} <button className="btn-secondary" type="button" onClick={fetchCurrent}>Retry</button></div>}
            {metadata && <div className="documentation-reader-grid">
                <article className="documentation-paper">
                    <div className="documentation-find">
                        <Input aria-label="Find in this document" placeholder="Find in this document" value={query} maxLength={120} onValueChange={setQuery} onKeyDown={(event) => {
                            if (event.key === 'Enter' && matchIds.length) { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
                            if (event.key === 'Escape') setQuery('');
                        }} />
                        {query && <span role="status">{matchIds.length ? `${activeIndex + 1} of ${matchIds.length}` : 'No matches'}</span>}
                        <button className="btn-secondary" type="button" onClick={() => move(-1)} disabled={!matchIds.length} aria-label="Previous match"><ChevronUp size={16} /></button>
                        <button className="btn-secondary" type="button" onClick={() => move(1)} disabled={!matchIds.length} aria-label="Next match"><ChevronDown size={16} /></button>
                    </div>
                    <div ref={contentRef}><DocumentBlocks blocks={blocks} query={query} activeId={activeId} /></div>
                    {!blocks.length && !loading && <p>This document has no page content.</p>}
                </article>
                {sections.length > 0 && <nav className="documentation-toc" aria-label="On this page">
                    <strong>On this page</strong>
                    {sections.map((section) => <a key={section.id} href={`#section-${section.id}`} className={`documentation-toc-${section.type}`}>{section.richText.map((part) => part.text).join('')}</a>)}
                </nav>}
            </div>}
        </div>
    </AppShell>;
}
