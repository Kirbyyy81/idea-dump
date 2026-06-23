import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { DRIVE_IMAGE_MIME_TYPES, GOOGLE_DRIVE_READONLY_SCOPE } from './constants';

interface GoogleTokenResponse {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
}

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    thumbnailLink?: string;
    imageMediaMetadata?: {
        width?: number;
        height?: number;
    };
}

function getRequiredEnv(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function getEncryptionKey() {
    const raw = getRequiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY');
    if (/^[a-fA-F0-9]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }

    const fromBase64 = Buffer.from(raw, 'base64');
    if (fromBase64.length === 32) {
        return fromBase64;
    }

    return crypto.createHash('sha256').update(raw).digest();
}

export function encryptToken(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptToken(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
        throw new Error('Invalid encrypted token');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getEncryptionKey(),
        Buffer.from(ivValue, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

export function getGoogleAuthUrl(state: string) {
    const params = new URLSearchParams({
        access_type: 'offline',
        client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
        include_granted_scopes: 'true',
        prompt: 'consent',
        redirect_uri: getRequiredEnv('GOOGLE_DRIVE_REDIRECT_URI'),
        response_type: 'code',
        scope: GOOGLE_DRIVE_READONLY_SCOPE,
        state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
    const body = new URLSearchParams({
        client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
        client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
        code,
        grant_type: 'authorization_code',
        redirect_uri: getRequiredEnv('GOOGLE_DRIVE_REDIRECT_URI'),
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        throw new Error('Failed to exchange Google authorization code');
    }

    return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string) {
    const body = new URLSearchParams({
        client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
        client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        throw new Error('Failed to refresh Google access token');
    }

    return (await res.json()) as GoogleTokenResponse;
}

export async function storeDriveTokens(userId: string, tokenResponse: GoogleTokenResponse) {
    const admin = createAdminClient();
    const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        : null;

    const existing = await admin
        .from('film_drive_connections')
        .select('refresh_token_encrypted')
        .eq('user_id', userId)
        .maybeSingle();

    if (existing.error) {
        throw existing.error;
    }

    const refreshToken = tokenResponse.refresh_token
        ? encryptToken(tokenResponse.refresh_token)
        : existing.data?.refresh_token_encrypted ?? null;

    const { error } = await admin.from('film_drive_connections').upsert({
        user_id: userId,
        access_token_encrypted: encryptToken(tokenResponse.access_token),
        refresh_token_encrypted: refreshToken,
        expires_at: expiresAt,
        scope: tokenResponse.scope ?? GOOGLE_DRIVE_READONLY_SCOPE,
        token_type: tokenResponse.token_type ?? 'Bearer',
        updated_at: new Date().toISOString(),
    });

    if (error) {
        throw error;
    }
}

export async function getValidDriveAccessToken(userId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('film_drive_connections')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    const shouldRefresh = Boolean(data.refresh_token_encrypted) && expiresAt < Date.now() + 60_000;

    if (!shouldRefresh) {
        return decryptToken(data.access_token_encrypted);
    }

    const refreshed = await refreshAccessToken(decryptToken(data.refresh_token_encrypted));
    await storeDriveTokens(userId, refreshed);
    return refreshed.access_token;
}

export async function listDriveImages(folderId: string, accessToken: string) {
    const mimeQuery = DRIVE_IMAGE_MIME_TYPES.map((mimeType) => `mimeType='${mimeType}'`).join(' or ');
    const params = new URLSearchParams({
        fields: 'files(id,name,mimeType,webViewLink,thumbnailLink,imageMediaMetadata(width,height))',
        orderBy: 'name_natural',
        pageSize: '1000',
        q: `'${folderId}' in parents and trashed=false and (${mimeQuery})`,
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        throw new Error('Failed to list Google Drive folder images');
    }

    const payload = (await res.json()) as { files?: DriveFile[] };
    return payload.files ?? [];
}
