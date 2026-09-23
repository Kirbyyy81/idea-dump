import type { DocumentationBlock, DocumentationBlockPage, DocumentationPage, DocumentationTreeBlock } from '@/lib/types';
import { requestApi } from '@/lib/api/client';

export interface DocumentationCatalogPage {
    documents: DocumentationPage[];
    nextCursor: string | null;
}

export function blockText(block: DocumentationBlock): string {
    if (block.type === 'child_page') return '';
    const text = block.richText.map((part) => part.text).join('');
    const cells = block.cells?.map((cell) => cell.map((part) => part.text).join('')).join(' ') || '';
    return [text, cells, block.type === 'code' ? block.language : ''].filter(Boolean).join(' ');
}

export function findTextOffsets(value: string, query: string): number[] {
    if (!query.trim()) return [];
    const haystack = value.toLocaleLowerCase();
    const needle = query.trim().toLocaleLowerCase();
    const positions: number[] = [];
    let start = 0;
    while (start < haystack.length) {
        const index = haystack.indexOf(needle, start);
        if (index < 0) break;
        positions.push(index);
        start = index + Math.max(needle.length, 1);
    }
    return positions;
}

export function searchDocument(blocks: DocumentationTreeBlock[], query: string) {
    const snippets: string[] = [];
    let matches = 0;
    const visit = (items: DocumentationTreeBlock[]) => {
        for (const block of items) {
            if (block.type === 'child_page') continue;
            const fields = [block.richText.map((part) => part.text).join(''),
                ...(block.cells?.map((cell) => cell.map((part) => part.text).join('')) || [])];
            for (const text of fields) {
                const positions = findTextOffsets(text, query);
                matches += positions.length;
                if (positions.length && snippets.length < 3) {
                    const start = Math.max(0, positions[0] - 65);
                    snippets.push(text.slice(start, start + 180).replace(/\s+/g, ' ').trim());
                }
            }
            visit(block.children);
        }
    };
    visit(blocks);
    return { matches, snippets };
}

export async function loadCatalog(signal?: AbortSignal): Promise<DocumentationPage[]> {
    const documents: DocumentationPage[] = [];
    let cursor: string | null = null;
    do {
        const url = cursor ? `/api/documentation?cursor=${encodeURIComponent(cursor)}` : '/api/documentation';
        const page: DocumentationCatalogPage = await requestApi(url, { cache: 'no-store', signal });
        documents.push(...page.documents);
        cursor = page.nextCursor;
    } while (cursor);
    return documents;
}

export async function loadDocumentTree(
    pageId: string,
    signal?: AbortSignal,
    onProgress?: (blocks: number) => void
): Promise<DocumentationTreeBlock[]> {
    let count = 0;
    async function loadChildren(parentId: string, depth: number): Promise<DocumentationTreeBlock[]> {
        if (depth > 32) throw new Error('Document nesting is too deep.');
        const children: DocumentationTreeBlock[] = [];
        let cursor: string | null = null;
        do {
            const query = new URLSearchParams({ parentId });
            if (cursor) query.set('cursor', cursor);
            const page: DocumentationBlockPage = await requestApi(
                `/api/documentation/${pageId}/content?${query}`,
                { cache: 'no-store', signal }
            );
            for (const block of page.blocks) {
                const item: DocumentationTreeBlock = { ...block, children: [] };
                children.push(item);
                count += 1;
                onProgress?.(count);
                if (block.hasChildren && block.type !== 'child_page') {
                    item.children = await loadChildren(block.id, depth + 1);
                }
            }
            cursor = page.nextCursor;
        } while (cursor);
        return children;
    }
    return loadChildren(pageId, 0);
}
