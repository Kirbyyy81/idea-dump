import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    FILM_COVER_BUCKET,
    FILM_COVER_MAX_BYTES,
    FILM_COVER_MIME_TYPES,
} from '@/lib/film/core/constants';

export type FilmCoverMimeType = (typeof FILM_COVER_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<FilmCoverMimeType, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

function detectMimeType(bytes: Uint8Array): FilmCoverMimeType | null {
    if (bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (bytes.length >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'image/png';
    }
    if (
        bytes.length >= 12
        && hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    ) {
        return 'image/webp';
    }
    return null;
}

export async function validateFilmCover(file: File) {
    if (!FILM_COVER_MIME_TYPES.includes(file.type as FilmCoverMimeType)) {
        return { ok: false, error: 'Cover image must be JPEG, PNG, or WebP' } as const;
    }
    if (file.size <= 0 || file.size > FILM_COVER_MAX_BYTES) {
        return { ok: false, error: 'Cover image must be between 1 byte and 4 MB' } as const;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectMimeType(bytes);
    if (!mimeType || mimeType !== file.type) {
        return { ok: false, error: 'Cover image content does not match its declared file type' } as const;
    }

    return { ok: true, bytes, mimeType } as const;
}

export function createFilmCoverPath(userId: string, rollId: string, mimeType: FilmCoverMimeType) {
    return `${userId}/${rollId}/cover-${crypto.randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
}

export function isOwnedFilmCoverPath(path: unknown, userId: string, rollId: string): path is string {
    if (typeof path !== 'string') return false;
    const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedRollId = rollId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedUserId}/${escapedRollId}/cover-[a-f0-9-]+\\.(jpg|jpeg|png|webp)$`).test(path);
}

export async function removeFilmCover(path: string) {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(FILM_COVER_BUCKET).remove([path]);
    if (error) throw error;
}

export async function downloadFilmCover(path: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(FILM_COVER_BUCKET).download(path);
    if (error || !data) return null;
    return data;
}

export async function uploadFilmCover(path: string, bytes: Uint8Array, mimeType: FilmCoverMimeType) {
    const admin = createAdminClient();
    const { error } = await admin.storage
        .from(FILM_COVER_BUCKET)
        .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (error) throw error;
}

export async function removeFilmCoverObjects(
    userId: string,
    rollId: string,
    keepPath?: string
) {
    const admin = createAdminClient();
    const folder = `${userId}/${rollId}`;
    const objects: Array<{ name: string }> = [];
    const pageSize = 100;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.storage
            .from(FILM_COVER_BUCKET)
            .list(folder, { limit: pageSize, offset });
        if (error) throw error;
        objects.push(...(data ?? []));
        if ((data ?? []).length < pageSize) break;
    }

    const removablePaths = objects
        .map((object) => `${folder}/${object.name}`)
        .filter((path) => path !== keepPath && isOwnedFilmCoverPath(path, userId, rollId));

    if (!removablePaths.length) return;

    for (let index = 0; index < removablePaths.length; index += pageSize) {
        const { error } = await admin.storage
            .from(FILM_COVER_BUCKET)
            .remove(removablePaths.slice(index, index + pageSize));
        if (error) throw error;
    }
}
