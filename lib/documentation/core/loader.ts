import { ApiClientError, requestApi } from '@/lib/api/client';
import type { DocumentationBlock, DocumentationBlockPage, DocumentationBranchState, DocumentationContentSnapshot, DocumentationTreeBlock } from '@/lib/types';

interface Branch extends DocumentationBranchState {
    blocks: DocumentationBlock[];
    cursor: string | null;
    cursors: Set<string>;
    depth: number;
    outline: boolean;
}

export function isDocumentAccessError(error: unknown): boolean {
    return error instanceof ApiClientError && [401, 403, 404].includes(error.status);
}

/** One reader's in-memory content, with a serial, deduplicated request queue. */
export class DocumentContentLoader {
    private branches = new Map<string, Branch>();
    private pending = new Map<string, Promise<void>>();
    private queue: Promise<void> = Promise.resolve();
    private fatal: unknown = null;

    constructor(
        readonly pageId: string,
        private signal: AbortSignal,
        private onChange: (snapshot: DocumentationContentSnapshot) => void = () => {},
        private onAccessError: (error: unknown) => void = () => {},
    ) {
        this.addBranch(pageId, 0, true);
    }

    private addBranch(id: string, depth: number, outline: boolean) {
        if (!this.branches.has(id)) this.branches.set(id, {
            blocks: [], cursor: null, cursors: new Set(), depth, outline,
            status: 'idle', complete: false, hasLoaded: false, error: null,
        });
    }

    snapshot(): DocumentationContentSnapshot {
        const tree = (id: string, depth = 0): DocumentationTreeBlock[] => depth > 32 ? []
            : (this.branches.get(id)?.blocks || []).map((block) => ({ ...block,
                children: block.type === 'child_page' ? [] : tree(block.id, depth + 1),
            }));
        const branches: DocumentationContentSnapshot['branches'] = {};
        let count = 0;
        let failures = 0;
        let complete = true;
        let outlineComplete = true;
        let outlineFailures = 0;
        for (const [id, branch] of this.branches) {
            branches[id] = { status: branch.status, complete: branch.complete, hasLoaded: branch.hasLoaded, error: branch.error };
            count += branch.blocks.length;
            if (branch.error) failures++;
            if (!branch.complete) complete = false;
            if (branch.outline && !branch.complete) outlineComplete = false;
            if (branch.outline && branch.error) outlineFailures++;
        }
        return { blocks: tree(this.pageId), branches, count, complete, failures, outlineComplete, outlineFailures };
    }

    private publish() {
        if (!this.signal.aborted && !this.fatal) this.onChange(this.snapshot());
    }

    loadNext(parentId: string, retry = false): Promise<void> {
        const existing = this.pending.get(parentId);
        if (existing) return existing;
        const branch = this.branches.get(parentId);
        if (!branch || branch.complete || (branch.error && !retry) || this.signal.aborted || this.fatal) return Promise.resolve();
        branch.status = 'loading';
        branch.error = null;
        const task = this.queue.then(async () => {
            if (this.signal.aborted || this.fatal) return;
            try {
                if (branch.depth > 32) throw new Error('Document nesting is too deep.');
                const query = new URLSearchParams({ parentId });
                if (branch.cursor) query.set('cursor', branch.cursor);
                const page = await requestApi<DocumentationBlockPage>(`/api/documentation/${this.pageId}/content?${query}`, {
                    cache: 'no-store', signal: this.signal,
                });
                if (this.signal.aborted) return;
                if (page.nextCursor && (page.nextCursor === branch.cursor || branch.cursors.has(page.nextCursor))) {
                    throw new Error('Notion repeated a content page. Retry this section.');
                }
                const known = new Set(branch.blocks.map((block) => block.id));
                for (const block of page.blocks) {
                    if (known.has(block.id)) continue;
                    known.add(block.id);
                    branch.blocks.push(block);
                    if (block.hasChildren && block.type !== 'child_page') {
                        this.addBranch(block.id, branch.depth + 1, branch.outline && block.type !== 'table');
                    }
                }
                if (page.nextCursor) branch.cursors.add(page.nextCursor);
                branch.cursor = page.nextCursor;
                branch.complete = !page.nextCursor;
                branch.hasLoaded = true;
            } catch (error) {
                if (this.signal.aborted) return;
                if (isDocumentAccessError(error)) {
                    this.fatal = error;
                    this.branches.clear();
                    this.onAccessError(error);
                    return;
                }
                branch.error = error instanceof Error ? error.message : 'Could not load this section.';
            } finally {
                branch.status = branch.error ? 'error' : 'idle';
                this.pending.delete(parentId);
                this.publish();
            }
        });
        this.pending.set(parentId, task);
        this.queue = task;
        this.publish();
        return task;
    }

    /** Discover headings through structural branches before fetching table rows. */
    async loadOutline(shouldContinue: () => boolean = () => true): Promise<void> {
        while (!this.signal.aborted && !this.fatal && shouldContinue()) {
            const next = [...this.branches].find(([, branch]) => branch.outline && !branch.complete && !branch.error);
            if (!next) break;
            await this.loadNext(next[0]);
        }
        if (this.fatal) throw this.fatal;
    }

    async retryOutline(): Promise<void> {
        for (const [id, branch] of this.branches) {
            if (branch.outline && branch.error) await this.loadNext(id, true);
        }
        await this.loadOutline();
    }

    /** Search consumes all remaining branches, including closed toggles, but never Versions. */
    async loadAll(shouldContinue: () => boolean = () => true): Promise<void> {
        await this.loadOutline(shouldContinue);
        while (!this.signal.aborted && !this.fatal && shouldContinue()) {
            const next = [...this.branches].find(([, branch]) => !branch.complete && !branch.error);
            if (!next) break;
            await this.loadNext(next[0]);
        }
        if (this.fatal) throw this.fatal;
    }

    async retryFailed(): Promise<void> {
        for (const [id, branch] of this.branches) {
            if (branch.error) await this.loadNext(id, true);
        }
    }
}
