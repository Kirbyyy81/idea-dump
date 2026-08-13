// @vitest-environment node

import { File } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    detectFinanceShareImageType,
    MAX_FINANCE_SHARE_BATCH_BYTES,
    MAX_FINANCE_SHARE_FILE_BYTES,
    MAX_FINANCE_SHARE_FILES,
    MAX_FINANCE_SHARE_IMAGE_DIMENSION,
    validateFinanceSharedFile,
} from '@/lib/finance/share/files';
import {
    FINANCE_SHARE_MESSAGE_TYPES,
    FINANCE_SHARE_QUERY_PARAM,
    parseFinanceShareClientMessage,
    parseFinanceShareWorkerMessage,
} from '@/lib/finance/share/protocol';

const root = path.resolve(import.meta.dirname, '..');

function readSource(...segments: string[]) {
    return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

type WorkerHandler = (event: Record<string, unknown>) => void;

afterEach(() => vi.unstubAllGlobals());

describe('Finance share target contracts', () => {
    it('parses the shared client and worker message protocol', () => {
        const types = FINANCE_SHARE_MESSAGE_TYPES;
        expect(FINANCE_SHARE_QUERY_PARAM).toBe('finance_share');
        expect(parseFinanceShareWorkerMessage({
            type: types.payload,
            shareId: 'share-1',
            files: ['file'],
        })).toEqual({ type: types.payload, shareId: 'share-1', files: ['file'] });
        expect(parseFinanceShareWorkerMessage({
            type: types.error,
            shareId: 'share-2',
            message: 'Could not read files',
        })).toEqual({
            type: types.error,
            shareId: 'share-2',
            message: 'Could not read files',
        });
        expect(parseFinanceShareWorkerMessage({ type: types.payload })).toBeNull();
        expect(parseFinanceShareWorkerMessage({
            type: 'unknown',
            shareId: 'share-3',
        })).toBeNull();
        expect(parseFinanceShareClientMessage({ type: types.ready })).toEqual({
            type: types.ready,
        });
        expect(parseFinanceShareClientMessage({
            type: types.claim,
            shareId: 'share-4',
        })).toEqual({ type: types.claim, shareId: 'share-4' });
        expect(parseFinanceShareClientMessage({ type: types.claim })).toBeNull();
        expect(parseFinanceShareClientMessage({ type: 'unknown' })).toBeNull();

        const workerSource = readSource('public', 'sw.js');
        Object.values(types).forEach((type) => expect(workerSource).toMatch(type));
        const typedWorkerSource = readSource('service-worker', 'sw.ts');
        expect(typedWorkerSource).toMatch(
            /from ['"]\.\.\/lib\/finance\/share\/protocol['"]/
        );
        expect(typedWorkerSource).toMatch(/parseFinanceShareClientMessage/);
        Object.values(types).forEach((type) => expect(typedWorkerSource).not.toMatch(type));
    });

    it('keeps share handling scoped to the Finance route boundary', () => {
        const shell = readSource('components', 'organisms', 'AuthenticatedAppShell.tsx');
        const financeLayout = readSource('app', 'finance', 'layout.tsx');
        const provider = readSource(
            'app',
            'finance',
            '_components',
            'FinanceShareTargetProvider.tsx'
        );
        const rejectionBridge = readSource(
            'app',
            '_components',
            'FinanceShareRejectionBridge.tsx'
        );

        expect(shell).toMatch(/<FinanceShareRejectionBridge\s*\/>/);
        expect(shell).not.toMatch(/<FinanceShareTargetProvider>/);
        expect(financeLayout).toMatch(
            /<FinanceShareTargetProvider>\{children\}<\/FinanceShareTargetProvider>/
        );
        expect(provider).not.toMatch(/useAccess/);
        expect(provider).toMatch(/parseFinanceShareWorkerMessage/);
        expect(rejectionBridge).toMatch(/const canAccessFinance/);
        expect(rejectionBridge).toMatch(/if \(canAccessFinance/);
        expect(rejectionBridge).toMatch(/shared images were discarded/);
    });

    it('validates shared image signatures, sizes, and dimensions', async () => {
        expect(MAX_FINANCE_SHARE_FILES).toBe(10);
        expect(MAX_FINANCE_SHARE_FILE_BYTES).toBe(4 * 1024 * 1024);
        expect(MAX_FINANCE_SHARE_BATCH_BYTES).toBe(
            MAX_FINANCE_SHARE_FILES * MAX_FINANCE_SHARE_FILE_BYTES
        );
        expect(detectFinanceShareImageType(Uint8Array.from([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
        ]))).toBe('image/png');
        expect(detectFinanceShareImageType(Uint8Array.from([
            0x52,
            0x49,
            0x46,
            0x46,
            0,
            0,
            0,
            0,
            0x57,
            0x45,
            0x42,
            0x50,
        ]))).toBe('image/webp');
        expect(detectFinanceShareImageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(
            'image/jpeg'
        );

        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 1200,
            height: 2400,
            close() {},
        })));
        const png = new File([
            Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
        ], 'receipt.png', { type: 'image/png' }) as unknown as globalThis.File;
        await expect(validateFinanceSharedFile(png)).resolves.toMatchObject({ isValid: true });

        const misleading = new File([
            Uint8Array.from([0xff, 0xd8, 0xff, 1]),
        ], 'not-really.png', { type: 'image/png' }) as unknown as globalThis.File;
        await expect(validateFinanceSharedFile(misleading)).resolves.toMatchObject({
            isValid: false,
            message: expect.stringMatching(/does not match/i),
        });

        const oversized = new File([
            new Uint8Array(MAX_FINANCE_SHARE_FILE_BYTES + 1),
        ], 'oversized.png', { type: 'image/png' }) as unknown as globalThis.File;
        await expect(validateFinanceSharedFile(oversized)).resolves.toMatchObject({
            message: expect.stringMatching(/larger than 4 MB/i),
        });

        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: MAX_FINANCE_SHARE_IMAGE_DIMENSION + 1,
            height: 1,
            close() {},
        })));
        await expect(validateFinanceSharedFile(png)).resolves.toMatchObject({
            message: expect.stringMatching(/dimensions are too large/i),
        });
    });

    it('hands shared files to the correct client and expires acknowledged work', async () => {
        const workerSource = readSource('public', 'sw.js');
        const handlers = new Map<string, WorkerHandler>();
        const timers = new Map<number, () => void>();
        let nextTimerId = 1;
        const context = vm.createContext({
            URL,
            Request,
            Response,
            FormData,
            File,
            Promise,
            Map,
            setTimeout(callback: () => void) {
                const timerId = nextTimerId++;
                timers.set(timerId, callback);
                return timerId;
            },
            clearTimeout(timerId: number) {
                timers.delete(timerId);
            },
            crypto: { randomUUID },
            caches: {
                open: async () => ({
                    addAll: async () => {},
                    keys: async () => [],
                    put: async () => {},
                    delete: async () => true,
                }),
                keys: async () => [],
                match: async () => null,
                delete: async () => true,
            },
            self: {
                location: { origin: 'https://idea-dump.test' },
                clients: { claim: async () => {} },
                skipWaiting() {},
                addEventListener(type: string, handler: WorkerHandler) {
                    handlers.set(type, handler);
                },
            },
        });
        vm.runInContext(workerSource, context, { filename: 'public/sw.js' });

        async function receiveShare(resultingClientId: string, filenames: string[]) {
            const formData = new FormData();
            filenames.forEach((filename) => formData.append(
                'finance_images',
                new File([filename], filename, { type: 'image/png' }) as unknown as Blob
            ));
            const request = new Request('https://idea-dump.test/share-target/finance', {
                method: 'POST',
                body: formData,
            });
            let responsePromise: Promise<Response> | undefined;
            let lifetimePromise: Promise<void> | undefined;
            handlers.get('fetch')?.({
                request,
                resultingClientId,
                respondWith(value: Promise<Response>) {
                    responsePromise = Promise.resolve(value);
                },
                waitUntil(value: Promise<void>) {
                    lifetimePromise = Promise.resolve(value);
                },
            });
            const response = await responsePromise;
            expect(response?.status).toBe(303);
            const location = new URL(response?.headers.get('location') ?? '');
            expect(location.pathname).toBe('/finance/add');
            const shareId = location.searchParams.get('finance_share');
            expect(shareId).toBeTruthy();
            return { shareId: shareId as string, lifetimePromise };
        }

        function createClient(id: string) {
            const posted: Record<string, unknown>[] = [];
            return {
                posted,
                source: {
                    id,
                    postMessage(message: Record<string, unknown>) {
                        posted.push(message);
                    },
                },
            };
        }

        const types = FINANCE_SHARE_MESSAGE_TYPES;
        const accepted = await receiveShare('finance-client', ['one.png', 'two.png']);
        const acceptedClient = createClient('finance-client');
        handlers.get('message')?.({
            data: { type: types.claim, shareId: accepted.shareId },
            source: acceptedClient.source,
        });
        expect(acceptedClient.posted[0].type).toBe(types.payload);
        expect(acceptedClient.posted[0].files).toHaveLength(2);

        handlers.get('message')?.({ data: { type: types.ready }, source: acceptedClient.source });
        expect(acceptedClient.posted).toHaveLength(1);
        handlers.get('message')?.({
            data: { type: 'finance-share:invalid', shareId: accepted.shareId },
            source: acceptedClient.source,
        });
        handlers.get('message')?.({ data: { type: types.claim }, source: acceptedClient.source });
        expect(acceptedClient.posted).toHaveLength(1);

        handlers.get('message')?.({
            data: { type: types.acknowledge, shareId: accepted.shareId },
            source: acceptedClient.source,
        });
        await accepted.lifetimePromise;
        handlers.get('message')?.({
            data: { type: types.claim, shareId: accepted.shareId },
            source: acceptedClient.source,
        });
        expect(acceptedClient.posted[1].type).toBe(types.missing);

        const isolated = await receiveShare('target-tab', ['isolated.png']);
        const wrongTab = createClient('other-tab');
        handlers.get('message')?.({ data: { type: types.ready }, source: wrongTab.source });
        expect(wrongTab.posted).toHaveLength(0);
        const targetTab = createClient('target-tab');
        handlers.get('message')?.({ data: { type: types.ready }, source: targetTab.source });
        expect(targetTab.posted[0]).toMatchObject({ type: types.payload, shareId: isolated.shareId });
        handlers.get('message')?.({
            data: { type: types.acknowledge, shareId: isolated.shareId },
            source: targetTab.source,
        });
        await isolated.lifetimePromise;

        const expired = await receiveShare('expired-tab', ['expired.png']);
        expect(timers.size).toBe(1);
        [...timers.values()].forEach((callback) => callback());
        await expired.lifetimePromise;
        const expiredTab = createClient('expired-tab');
        handlers.get('message')?.({
            data: { type: types.claim, shareId: expired.shareId },
            source: expiredTab.source,
        });
        expect(expiredTab.posted[0].type).toBe(types.missing);

        const invalid = await receiveShare('invalid-tab', []);
        const invalidTab = createClient('invalid-tab');
        handlers.get('message')?.({
            data: { type: types.claim, shareId: invalid.shareId },
            source: invalidTab.source,
        });
        expect(invalidTab.posted[0].type).toBe(types.error);
        expect(invalidTab.posted[0].message).toMatch(/No image files were received/);
        await invalid.lifetimePromise;
    });

    it('declares the Finance image share target in the manifest', () => {
        const source = readSource('app', 'manifest.ts');
        expect(source).toMatch(/action:\s*['"]\/share-target\/finance['"]/);
        expect(source).toMatch(/method:\s*['"]POST['"]/);
        expect(source).toMatch(/enctype:\s*['"]multipart\/form-data['"]/);
        expect(source).toMatch(/name:\s*['"]finance_images['"]/);
        expect(source).toMatch(/image\/png/);
        expect(source).toMatch(/image\/jpeg/);
        expect(source).toMatch(/image\/webp/);
    });

    it('keeps preparation retries idempotent and user messaging accurate', () => {
        const source = readSource('lib', 'finance', 'share', 'client.ts');
        const experience = readSource(
            'app',
            'finance',
            'add',
            '_components',
            'FinanceShareExperience.tsx'
        );
        expect(source).toMatch(/request_id:\s*requestId/);
        expect(experience).toMatch(/prepareAttemptRef/);
        expect(experience).toMatch(/fingerprint:\s*fileFingerprint/);
        expect(experience).toMatch(/showSuccess\('You may leave the app\.',\s*'Images queued'\)/);
        expect(experience).toMatch(/Ready - you may close the app/);
        expect(experience).not.toMatch(/The batch disappears after processing/);
        expect(experience).not.toMatch(/Every selected image is stored privately/);
        expect(experience).not.toMatch(/Processing has not started/);
    });

    it('connects route handlers to the service and repository handoff', () => {
        const prepare = readSource(
            'app',
            'api',
            'finance',
            'share-batches',
            'prepare',
            'route.ts'
        );
        const commit = readSource(
            'app',
            'api',
            'finance',
            'share-batches',
            'commit',
            'route.ts'
        );
        const active = readSource(
            'app',
            'api',
            'finance',
            'share-batches',
            'active',
            'route.ts'
        );
        const server = readSource('lib', 'finance', 'share', 'server.ts');
        const service = readSource('lib', 'finance', 'core', 'service.ts');
        const repository = readSource('lib', 'finance', 'core', 'repository.ts');

        expect(prepare).toMatch(/prepareFinanceShareBatchForUser/);
        expect(repository).toMatch(/finance_prepare_share_batch_v1/);
        expect(repository).toMatch(/createSignedUploadUrl\(storagePath,\s*\{\s*upsert:\s*true\s*\}\)/);
        expect(commit).toMatch(/commitFinanceShareBatchForUser/);
        expect(service).toMatch(/getFinanceShareObjectInfo\(item\.storage_path\)/);
        expect(service).toMatch(/record\.contentType/);
        expect(repository).toMatch(/finance_commit_share_batch_v1/);
        expect(commit).toMatch(/safe_to_close:\s*true/);
        expect(active).toMatch(/getOwnedActiveFinanceShareBatch/);
        expect(server).toMatch(/message\.includes\('FINANCE_SHARE_ACCESS_DENIED'\)/);
        expect(server).not.toMatch(/error\.code === '42501'/);
    });

    it('uses a least-privilege database queue payload', () => {
        const migration = readSource(
            'supabase',
            'migrations',
            '20260725081908_add_finance_share_batches.sql'
        );
        expect(migration).toMatch(/create extension if not exists pgmq/i);
        expect(migration).toMatch(/perform pgmq\.create\('finance_share_ocr'\)/i);
        expect(migration).toMatch(
            /from pgmq\.read\('finance_share_ocr',\s*p_lease_seconds,\s*1\)/i
        );
        expect(migration).toMatch(/perform pgmq\.delete\('finance_share_ocr'/i);
        const queueSend = migration.match(/pgmq\.send\([\s\S]*?\) sent_message_id;/)?.[0] ?? '';
        expect(queueSend).toMatch(/'batchId'[\s\S]*'batchItemId'[\s\S]*'processingVersion'/);
        expect(queueSend).not.toMatch(/storage_path|user_id|original_filename|token/i);
        expect(migration).toMatch(/from public, anon, authenticated, service_role/);
        expect(migration).toMatch(/to service_role/);
    });
});
