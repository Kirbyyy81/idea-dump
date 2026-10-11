import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { syncFilmDriveImages } from '@/lib/film/core/repository';
import { listDriveImages } from '@/lib/film/integrations/google';

function query(result: { data?: unknown; error?: unknown } = {}) {
    const promise = Promise.resolve({ data: null, error: null, ...result });
    return {
        select: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: promise.then.bind(promise),
    };
}

const command = { film_roll_id: 'roll-1', folder_id: 'folder-1' };
const imageFile = (index: number) => ({
    driveFileId: `image-${index}`,
    name: `${index}.JPG`,
    mimeType: 'image/jpeg',
    height: null,
    thumbnailLink: null,
    webViewLink: null,
    width: null,
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('Drive sync frame count', () => {
    it.each([0, 24, 36])('saves %i frames from the synced folder', async (count) => {
        const files = Array.from({ length: count }, (_, index) => imageFile(index));
        const upsert = query();
        const existing = query({ data: [{ id: 'stale-photo', drive_file_id: 'old-file' }] });
        const remove = query();
        const roll = query();
        const photos = query({ data: files });
        const queries = [...(count ? [upsert] : []), existing, remove, roll, photos];
        const from = vi.fn(() => queries.shift());
        mocks.createAdminClient.mockReturnValue({ from });

        const result = await syncFilmDriveImages('owner-1', command, files);

        expect(roll.update).toHaveBeenCalledWith(expect.objectContaining({
            frames_taken: count,
            drive_folder_id: 'folder-1',
            status: 'PROCESSED',
        }));
        expect(roll.eq.mock.calls).toEqual([['id', 'roll-1'], ['user_id', 'owner-1']]);
        expect(remove.in).toHaveBeenCalledWith('id', ['stale-photo']);
        expect(result).toEqual({ photos: files, removedCount: 1 });
        expect(queries).toHaveLength(0);
    });

    it('does not update frames if saving the photos fails', async () => {
        const failure = new Error('Photo save failed');
        const from = vi.fn(() => query({ error: failure }));
        mocks.createAdminClient.mockReturnValue({ from });

        await expect(syncFilmDriveImages('owner-1', command, [imageFile(1)])).rejects.toThrow(failure);
        expect(from.mock.calls).toEqual([['film_photos']]);
    });
});

describe('Drive folder listing', () => {
    it('collects every page, including empty pages, and counts each image once', async () => {
        const first = { id: 'first', name: '01.JPG', mimeType: 'image/jpeg' };
        const second = { id: 'second', name: '02.PNG', mimeType: 'image/png' };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ files: [first], nextPageToken: 'page-2' }))
            .mockResolvedValueOnce(Response.json({ files: [], nextPageToken: 'page-3' }))
            .mockResolvedValueOnce(Response.json({ files: [first, second] }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await listDriveImages('folder-1', 'test-token')).toEqual([first, second]);
        const urls = fetchMock.mock.calls.map(([url]) => new URL(url));
        expect(urls.map((url) => url.searchParams.get('pageToken'))).toEqual([null, 'page-2', 'page-3']);
        for (const url of urls) {
            expect(url.searchParams.get('q')).toBe(
                "'folder-1' in parents and trashed=false and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp')"
            );
            expect(url.searchParams.get('fields')).toContain('nextPageToken');
        }
    });

    it('returns zero images for an empty folder', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ files: [] })));
        expect(await listDriveImages('folder-1', 'test-token')).toEqual([]);
    });

    it.each([
        Response.json({ error: { message: 'Access denied' } }, { status: 403 }),
        Response.json({ files: [], incompleteSearch: true }),
    ])('rejects failed or incomplete later pages rather than returning a partial count', async (response) => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(Response.json({ files: [{ id: 'first' }], nextPageToken: 'next' }))
            .mockResolvedValueOnce(response));

        await expect(listDriveImages('folder-1', 'test-token')).rejects.toThrow();
    });
});
