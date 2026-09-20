// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FINANCE_SHARE_MESSAGE_TYPES as types } from '@/lib/finance/share/protocol';

type Handler = (event: Record<string, unknown>) => void;

async function receive(request: Request, ready = false, foreignFileConstructor = false) {
    const handlers = new Map<string, Handler>();
    const posted: Record<string, unknown>[] = [];
    const context = vm.createContext({
        URL, Response, Map, Promise,
        File: foreignFileConstructor ? class extends File {} : File,
        crypto: { randomUUID },
        setTimeout: () => 1,
        clearTimeout: () => {},
        self: {
            location: { origin: 'https://idea-dump.test' },
            addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
        },
    });
    vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
    let responsePromise: Promise<Response> | undefined;
    let lifetime: Promise<void> | undefined;
    handlers.get('fetch')!({
        request,
        resultingClientId: 'receiving-tab',
        respondWith: (response: Promise<Response>) => { responsePromise = response; },
        waitUntil: (pending: Promise<void>) => { lifetime = pending; },
    });
    const response = await responsePromise;
    expect(response?.status).toBe(303);
    const target = new URL(response!.headers.get('location')!);
    expect(target.pathname).toBe('/finance/add');
    const shareId = target.searchParams.get('finance_share');
    const source = {
        id: 'receiving-tab',
        postMessage: (message: Record<string, unknown>) => posted.push(message),
    };
    handlers.get('message')!({
        source,
        data: ready ? { type: types.ready } : { type: types.claim, shareId },
    });
    handlers.get('message')!({ source, data: { type: types.acknowledge, shareId } });
    await lifetime;
    expect(posted).toHaveLength(1);
    return posted[0];
}

function shareRequest(entries: [string, string | File][] = []) {
    const body = new FormData();
    entries.forEach(([field, value]) => body.append(field, value));
    return new Request('https://idea-dump.test/share-target/finance', { method: 'POST', body });
}

function image(name: string) {
    return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
}

describe('Finance incoming share attachments', () => {
    it('recovers multiple attachments under alternate fields without treating text as files', async () => {
        const result = await receive(shareRequest([
            ['title', 'Private receipt title'],
            ['files', image('one.png')],
            ['files', image('two.png')],
            ['attachment', image('three.png')],
            ['url', 'content://private/image'],
        ]));
        expect(result.type).toBe(types.payload);
        expect((result.files as File[]).map(file => file.name)).toEqual(['one.png', 'two.png', 'three.png']);
    });

    it('keeps the canonical file field authoritative when it contains attachments', async () => {
        const result = await receive(shareRequest([
            ['finance_images', image('receipt.png')],
            ['other', image('other.png')],
        ]));
        expect((result.files as File[]).map(file => file.name)).toEqual(['receipt.png']);
    });

    it('accepts parsed Files even when their constructor differs from the worker global', async () => {
        const result = await receive(shareRequest([['finance_images', image('receipt.png')]]), false, true);
        expect(result.type).toBe(types.payload);
        expect(result.files).toHaveLength(1);
    });

    it.each([false, true])('reports an empty share through claim/ready (ready=%s)', async ready => {
        const result = await receive(shareRequest(), ready);
        expect(result.type).toBe(types.error);
        expect(result.message).toContain('SHARE_EMPTY');
        expect(result.files).toBeUndefined();
    });

    it('does not fetch private URI text or echo its contents in the error', async () => {
        const result = await receive(shareRequest([['finance_images', 'content://private/receipt.png']]));
        expect(result.type).toBe(types.error);
        expect(result.message).toContain('SHARE_TEXT_ONLY');
        expect(JSON.stringify(result)).not.toContain('content://');
    });

    it('distinguishes malformed multipart bodies from empty shares', async () => {
        const request = new Request('https://idea-dump.test/share-target/finance', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data' },
            body: 'malformed-private-data',
        });
        const result = await receive(request);
        expect(result.type).toBe(types.error);
        expect(result.message).toContain('SHARE_UNREADABLE');
        expect(JSON.stringify(result)).not.toContain('malformed-private-data');
    });
});
