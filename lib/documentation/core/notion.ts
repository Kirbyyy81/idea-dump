import 'server-only';
import type { DocumentationBlock, DocumentationBlockPage, DocumentationPage, DocumentationRichText } from '@/lib/types';

const NOTION_VERSION = '2026-03-11';
const NOTION_ORIGIN = 'https://api.notion.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELAY_MS = 360;
let nextRequestAt = 0;

type RecordValue = Record<string, unknown>;

export class DocumentationError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'DocumentationError';
    }
}

export function isUuid(value: string): boolean {
    return UUID.test(value);
}

function record(value: unknown): RecordValue {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function string(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function configured() {
    const token = process.env.NOTION_API_TOKEN;
    const dataSourceId = process.env.NOTION_DOCUMENTS_DATA_SOURCE_ID;
    if (!token || !dataSourceId || !isUuid(dataSourceId)) {
        throw new DocumentationError(503, 'Documentation is not configured.');
    }
    return { token, dataSourceId };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

async function pace(signal?: AbortSignal) {
    const now = Date.now();
    const wait = Math.max(0, nextRequestAt - now);
    nextRequestAt = Math.max(now, nextRequestAt) + DELAY_MS;
    if (wait) await delay(wait, signal);
}

async function notion(path: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<RecordValue> {
    const { token } = configured();
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await pace(options.signal);
        const timeout = AbortSignal.timeout(15_000);
        const response = await fetch(`${NOTION_ORIGIN}/v1/${path}`, {
            method: options.body === undefined ? 'GET' : 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Notion-Version': NOTION_VERSION,
                ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            cache: 'no-store',
            signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        });
        if (response.ok) return record(await response.json());
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            const retrySeconds = Number(response.headers.get('Retry-After'));
            const retryDelay = Number.isFinite(retrySeconds) && retrySeconds > 0
                ? Math.min(retrySeconds * 1000, 10_000) : (attempt + 1) * 750;
            await delay(retryDelay, options.signal);
            continue;
        }
        if (response.status === 404 || response.status === 403) {
            throw new DocumentationError(404, 'Document not found.');
        }
        if (response.status === 401) throw new DocumentationError(503, 'Documentation connection is unavailable.');
        throw new DocumentationError(502, 'Notion could not be reached. Please try again.');
    }
    throw new DocumentationError(502, 'Notion could not be reached. Please try again.');
}

function title(value: unknown): string {
    return array(value).map((part) => string(record(part).plain_text)).join('');
}

function pageTitle(page: RecordValue): string {
    const properties = record(page.properties);
    const docName = record(properties['Doc name']);
    if (docName.type === 'title') return title(docName.title);
    for (const property of Object.values(properties)) {
        const item = record(property);
        if (item.type === 'title') return title(item.title);
    }
    return 'Untitled document';
}

function normalizePage(page: RecordValue): DocumentationPage {
    const properties = record(page.properties);
    const relation = array(record(properties.Projects).relation);
    const projectId = string(record(relation[0]).id) || null;
    const type = string(record(record(properties.Type).select).name) || null;
    const versionProperty = record(properties.Version);
    const version = title(versionProperty.rich_text) || null;
    const id = string(page.id);
    return {
        id,
        title: pageTitle(page),
        type,
        version,
        lastEditedTime: string(page.last_edited_time),
        projectId,
        projectName: null,
        notionUrl: string(page.url) || `https://www.notion.so/${id.replace(/-/g, '')}`,
    };
}

function isCurrentDocument(page: RecordValue): boolean {
    const { dataSourceId } = configured();
    const parent = record(page.parent);
    return !page.archived && !page.in_trash && parent.type === 'data_source_id' && parent.data_source_id === dataSourceId;
}

export async function getDocument(pageId: string, signal?: AbortSignal): Promise<DocumentationPage> {
    return normalizePage(await currentPage(pageId, signal));
}

async function currentPage(pageId: string, signal?: AbortSignal): Promise<RecordValue> {
    if (!isUuid(pageId)) throw new DocumentationError(400, 'Invalid document ID.');
    const page = await notion(`pages/${pageId}`, { signal });
    if (!isCurrentDocument(page)) throw new DocumentationError(404, 'Document not found.');
    return page;
}

export async function listDocuments(cursor: string | null, signal?: AbortSignal) {
    const { dataSourceId } = configured();
    if (cursor && cursor.length > 300) throw new DocumentationError(400, 'Invalid cursor.');
    const result = await notion(`data_sources/${dataSourceId}/query`, {
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }, signal,
    });
    if (!Array.isArray(result.results)) throw new DocumentationError(502, 'Notion returned an invalid document list.');
    const pages = array(result.results).map(record).filter(isCurrentDocument);
    const documents = pages.map(normalizePage);
    return { documents, nextCursor: string(result.next_cursor) || null };
}

function safeUrl(value: unknown): string | undefined {
    const input = string(value);
    try {
        const url = new URL(input);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

function richText(value: unknown): DocumentationRichText[] {
    return array(value).map((part): DocumentationRichText => {
        const item = record(part);
        const annotations = record(item.annotations);
        return {
            text: string(item.plain_text) || string(record(item.text).content),
            href: safeUrl(item.href) || null,
            bold: annotations.bold === true,
            italic: annotations.italic === true,
            underline: annotations.underline === true,
            strikethrough: annotations.strikethrough === true,
            code: annotations.code === true,
        };
    });
}

function normalizeBlock(raw: RecordValue, pageId: string): DocumentationBlock {
    const type = string(raw.type);
    const value = record(raw[type]);
    const block: DocumentationBlock = {
        id: string(raw.id), type, hasChildren: raw.has_children === true,
        richText: richText(value.rich_text || value.caption),
    };
    if (type === 'code') block.language = string(value.language);
    if (type === 'to_do') block.checked = value.checked === true;
    if (type === 'callout') block.icon = string(record(value.icon).emoji);
    if (type === 'child_page') block.title = string(value.title);
    if (type === 'table') {
        block.tableWidth = Number(value.table_width) || 0;
        block.tableHeader = value.has_column_header === true;
    }
    if (type === 'table_row') block.cells = array(value.cells).map(richText);
    if (['image', 'file', 'pdf', 'video', 'audio'].includes(type)) {
        block.isAsset = value.type === 'file';
        block.url = value.type === 'file'
            ? `/api/documentation/${pageId}/assets/${block.id}`
            : safeUrl(record(value.external).url);
        block.title = string(value.name);
    }
    if (type === 'bookmark' || type === 'embed' || type === 'link_preview') block.url = safeUrl(value.url);
    return block;
}

async function verifyDescendant(pageId: string, blockId: string, signal?: AbortSignal) {
    let current = blockId;
    const seen = new Set<string>();
    for (let depth = 0; depth < 32; depth += 1) {
        if (seen.has(current)) break;
        seen.add(current);
        const block = await notion(`blocks/${current}`, { signal });
        if (block.archived || block.in_trash || block.type === 'child_page') break;
        const parent = record(block.parent);
        if (parent.type === 'page_id') {
            if (parent.page_id === pageId) return block;
            break;
        }
        if (parent.type !== 'block_id') break;
        current = string(parent.block_id);
    }
    throw new DocumentationError(404, 'Block not found.');
}

export async function getBlockPage(pageId: string, parentId: string, cursor: string | null, signal?: AbortSignal): Promise<DocumentationBlockPage> {
    await currentPage(pageId, signal);
    if (!isUuid(parentId) || (cursor && cursor.length > 300)) {
        throw new DocumentationError(400, 'Invalid block request.');
    }
    if (parentId !== pageId) await verifyDescendant(pageId, parentId, signal);
    const parameters = new URLSearchParams({ page_size: parentId === pageId ? '50' : '100' });
    if (cursor) parameters.set('start_cursor', cursor);
    const result = await notion(`blocks/${parentId}/children?${parameters}`, { signal });
    if (!Array.isArray(result.results)) throw new DocumentationError(502, 'Notion returned invalid document content.');
    return {
        blocks: array(result.results).map((raw) => normalizeBlock(record(raw), pageId)),
        nextCursor: string(result.next_cursor) || null,
    };
}

export async function getAsset(pageId: string, blockId: string, signal?: AbortSignal) {
    await currentPage(pageId, signal);
    if (!isUuid(blockId)) throw new DocumentationError(400, 'Invalid asset ID.');
    const block = await verifyDescendant(pageId, blockId, signal);
    if (!['image', 'file', 'pdf', 'video', 'audio'].includes(string(block.type))) {
        throw new DocumentationError(404, 'Asset not found.');
    }
    const value = record(block[string(block.type)]);
    if (value.type !== 'file') throw new DocumentationError(404, 'Asset not found.');
    const location = string(record(value.file).url);
    const url = new URL(location);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(
        host === 'notion.so' || host.endsWith('.notion.so') ||
        host === 'notionusercontent.com' || host.endsWith('.notionusercontent.com') ||
        host === 'notion-static.com' || host.endsWith('.notion-static.com') ||
        host === 'amazonaws.com' || host.endsWith('.amazonaws.com')
    )) throw new DocumentationError(502, 'Asset source is unavailable.');
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal });
    if (!response.ok) throw new DocumentationError(502, 'Asset is unavailable.');
    const maxBytes = 25 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maxBytes) throw new DocumentationError(413, 'Asset is too large.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new DocumentationError(413, 'Asset is too large.');
    return { bytes, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}
