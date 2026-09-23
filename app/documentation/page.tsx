'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { loadCatalog, loadDocumentTree, searchDocument } from '@/lib/documentation/core/content';
import type { DocumentationPage } from '@/lib/types';
import './documentation.css';

interface SearchResult {
    page: DocumentationPage;
    matches: number;
    snippets: string[];
}

function readableDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Unknown date' : new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(date);
}

export default function DocumentationLibrary() {
    const [documents, setDocuments] = useState<DocumentationPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [activeQuery, setActiveQuery] = useState('');
    const [project, setProject] = useState('');
    const [type, setType] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [scanned, setScanned] = useState(0);
    const [failures, setFailures] = useState(0);
    const [searching, setSearching] = useState(false);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        const abort = new AbortController();
        loadCatalog(abort.signal).then(setDocuments).catch((cause) => {
            if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load documents.');
        }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
        return () => { abort.abort(); controller.current?.abort(); };
    }, []);

    const visible = useMemo(() => documents.filter((page) =>
        (!project || page.projectId === project) && (!type || page.type === type)
    ), [documents, project, type]);
    const projects = useMemo(() => [...new Map(documents.filter((page) => page.projectId).map((page) => [page.projectId!, page.projectName || 'Untitled project'])).entries()], [documents]);
    const types = useMemo(() => [...new Set(documents.map((page) => page.type).filter((value): value is string => Boolean(value)))], [documents]);

    const cancelSearch = () => {
        controller.current?.abort();
        controller.current = null;
        setSearching(false);
    };

    const changeProject = (value: string) => { cancelSearch(); setProject(value); setActiveQuery(''); setResults([]); };
    const changeType = (value: string) => { cancelSearch(); setType(value); setActiveQuery(''); setResults([]); };

    async function runSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        cancelSearch();
        const submitted = query.trim();
        setActiveQuery(submitted);
        setResults([]);
        setScanned(0);
        setFailures(0);
        if (!submitted) return;
        const abort = new AbortController();
        controller.current = abort;
        setSearching(true);
        for (const page of visible) {
            if (abort.signal.aborted) break;
            try {
                const blocks = await loadDocumentTree(page.id, abort.signal);
                const matches = searchDocument(blocks, submitted);
                if (!abort.signal.aborted && matches.matches) {
                    setResults((current) => [...current, { page, ...matches }]);
                }
            } catch {
                if (!abort.signal.aborted) setFailures((current) => current + 1);
            }
            if (!abort.signal.aborted) setScanned((current) => current + 1);
        }
        if (!abort.signal.aborted) setSearching(false);
        if (controller.current === abort) controller.current = null;
    }

    const displayed = activeQuery ? results.map((result) => result.page) : visible;
    const resultById = new Map(results.map((result) => [result.page.id, result]));

    return <AppShell pageTitle="Documentation">
        <div className="documentation-library">
            <form onSubmit={runSearch} className="documentation-toolbar">
                <Input aria-label="Search document contents" placeholder="Search document contents" value={query} maxLength={120} onValueChange={setQuery} />
                <button className="btn-primary" type="submit" disabled={loading || searching}><Search size={16} /> Search</button>
                {searching && <button className="btn-secondary" type="button" onClick={cancelSearch}><X size={16} /> Cancel</button>}
            </form>
            <div className="documentation-filters">
                <Select ariaLabel="Filter by Notion project" value={project} onChange={changeProject} options={[{ value: '', label: 'All Notion projects' }, ...projects.map(([value, label]) => ({ value, label }))]} />
                <Select ariaLabel="Filter by document type" value={type} onChange={changeType} options={[{ value: '', label: 'All types' }, ...types.map((value) => ({ value, label: value }))]} />
            </div>
            {loading && <p role="status">Loading documents…</p>}
            {error && <div className="documentation-notice" role="alert">{error} <button className="btn-secondary" type="button" onClick={() => window.location.reload()}>Retry</button></div>}
            {activeQuery && <div className="documentation-search-status" role="status">
                {searching ? `Searching ${scanned} of ${visible.length} documents` : `Searched ${scanned} of ${visible.length} documents`}
                {failures > 0 && <span> · {failures} could not be checked</span>}
                {failures > 0 && !searching && <button className="btn-secondary" type="button" onClick={() => document.querySelector<HTMLButtonElement>('.documentation-toolbar button[type="submit"]')?.click()}>Retry search</button>}
            </div>}
            {!loading && !error && !displayed.length && <div className="documentation-notice">
                {activeQuery ? searching ? 'No matches yet.' : failures ? 'No matches in the documents checked.' : 'No matches found.' : 'No documents found.'}
            </div>}
            <div className="documentation-grid">
                {displayed.map((page) => {
                    const result = resultById.get(page.id);
                    const href = `/documentation/${page.id}${activeQuery ? `?q=${encodeURIComponent(activeQuery)}` : ''}`;
                    return <Link key={page.id} href={href} className="documentation-card">
                        <div className="documentation-card-top"><span>{page.type || 'Document'}</span><span>{page.version || ''}</span></div>
                        <h2>{page.title}</h2>
                        <p>{page.projectName || 'No Notion project'}</p>
                        {result?.snippets.map((snippet, index) => <p className="documentation-snippet" key={index}>{snippet}</p>)}
                        <div className="documentation-card-bottom"><span>Edited {readableDate(page.lastEditedTime)}</span>{result && <span>{result.matches} matches</span>}</div>
                    </Link>;
                })}
            </div>
        </div>
    </AppShell>;
}
