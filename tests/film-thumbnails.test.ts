import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/film/core/repository');
vi.mock('@/lib/film/integrations/google', async (original) => ({
    ...await original<typeof import('@/lib/film/integrations/google')>(),
    getValidDriveAccessToken: vi.fn(),
}));
vi.mock('@/lib/film/core/api', async (original) => ({
    ...await original<typeof import('@/lib/film/core/api')>(),
    authorizeFilmJournal: vi.fn(),
}));

import { getDriveThumbnail, getValidDriveAccessToken } from '@/lib/film/integrations/google';
import { findFilmPhotoFileForUser } from '@/lib/film/core/repository';
import { authorizeFilmJournal } from '@/lib/film/core/api';
import { GET } from '@/app/api/film/photos/[id]/image/route';

const thumbnail = 'https://lh3.googleusercontent.com/current-thumbnail=s220';
const image = () => new Response('small-image', { headers: { 'Content-Type': 'image/webp' } });
const request = (query = '') => GET(new NextRequest(`http://localhost/api/film/photos/photo/image${query}`), { params: Promise.resolve({ id: 'photo' }) });

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('Drive thumbnail proxy', () => {
    it('resolves a fresh thumbnail and downloads it with credentials, not the original', async () => {
        const fetch = vi.fn().mockResolvedValueOnce(Response.json({ thumbnailLink: thumbnail })).mockResolvedValueOnce(image());
        vi.stubGlobal('fetch', fetch);
        expect(await (await getDriveThumbnail('file', 'token'))?.text()).toBe('small-image');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('fields')).toBe('thumbnailLink');
        expect(fetch.mock.calls[1]).toEqual([thumbnail, expect.objectContaining({ headers: { Authorization: 'Bearer token' }, redirect: 'manual' })]);
        expect(fetch.mock.calls.map(([url]) => url).join(' ')).not.toContain('alt=media');
    });

    it.each(['https://attacker.test/pic', 'http://lh3.googleusercontent.com/pic', 'https://lh3.googleusercontent.com.attacker.test/pic', 'https://user:pass@lh3.googleusercontent.com/pic'])('rejects untrusted thumbnail URL %s', async (thumbnailLink) => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ thumbnailLink }));
        vi.stubGlobal('fetch', fetch);
        expect(await getDriveThumbnail('file', 'token')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not forward credentials to an untrusted redirect', async () => {
        const fetch = vi.fn().mockResolvedValueOnce(Response.json({ thumbnailLink: thumbnail })).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://attacker.test/pic' } }));
        vi.stubGlobal('fetch', fetch);
        expect(await getDriveThumbnail('file', 'token')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([Response.json({}), Response.json({ error: 'denied' }, { status: 403 })])('does not download originals when thumbnails are absent', async (response) => {
        const fetch = vi.fn().mockResolvedValue(response);
        vi.stubGlobal('fetch', fetch);
        expect(await getDriveThumbnail('file', 'token')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects non-image thumbnail responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ thumbnailLink: thumbnail })).mockResolvedValueOnce(new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })));
        expect(await getDriveThumbnail('file', 'token')).toBeNull();
    });
});

describe('Private photo image route', () => {
    beforeEach(() => {
        vi.mocked(authorizeFilmJournal).mockResolvedValue({ user: { id: 'owner' } } as Awaited<ReturnType<typeof authorizeFilmJournal>>);
        vi.mocked(findFilmPhotoFileForUser).mockResolvedValue({ drive_file_id: 'file', name: '01.JPG', mime_type: 'image/jpeg' });
        vi.mocked(getValidDriveAccessToken).mockResolvedValue('token');
    });

    it('keeps previews private and uses the thumbnail content type', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ thumbnailLink: thumbnail })).mockResolvedValueOnce(image()));
        const response = await request('?size=thumbnail');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, max-age=300');
        expect(response.headers.get('vary')).toBe('Cookie, Authorization');
        expect(response.headers.get('content-type')).toBe('image/webp');
        expect(findFilmPhotoFileForUser).toHaveBeenCalledWith('owner', 'photo');
    });

    it('keeps the original available without thumbnail metadata or shared caching', async () => {
        const fetch = vi.fn().mockResolvedValue(image());
        vi.stubGlobal('fetch', fetch);
        const response = await request();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toContain('alt=media');
    });

    it('rejects invalid size and unowned photos before contacting Drive', async () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        expect((await request('?size=huge')).status).toBe(400);
        expect(findFilmPhotoFileForUser).not.toHaveBeenCalled();
        vi.mocked(findFilmPhotoFileForUser).mockResolvedValue(null);
        expect((await request('?size=thumbnail')).status).toBe(404);
        expect(getValidDriveAccessToken).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requires a valid session before looking up photo metadata', async () => {
        vi.mocked(authorizeFilmJournal).mockResolvedValue({ response: new Response(null, { status: 401 }) } as Awaited<ReturnType<typeof authorizeFilmJournal>>);
        expect((await request('?size=thumbnail')).status).toBe(401);
        expect(findFilmPhotoFileForUser).not.toHaveBeenCalled();
    });
});
