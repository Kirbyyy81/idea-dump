import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal } from '@/lib/film/api';
import { exchangeCodeForTokens, storeDriveTokens } from '@/lib/film/googleDrive';

export const dynamic = 'force-dynamic';

function googleRedirect(request: NextRequest, rollId: string | undefined, status: 'connected' | 'error'): NextResponse {
    const base = rollId ? `/film/rolls/${rollId}` : '/film';
    const response = NextResponse.redirect(new URL(`${base}?google=${status}`, request.url));
    response.cookies.delete('film_google_oauth_state');
    response.cookies.delete('film_google_oauth_roll_id');
    return response;
}

export async function GET(request: NextRequest) {
    const rollId = request.cookies.get('film_google_oauth_roll_id')?.value;

    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const expectedState = request.cookies.get('film_google_oauth_state')?.value;

        if (!code || !state || !expectedState || state !== expectedState) {
            return googleRedirect(request, rollId, 'error');
        }

        const tokens = await exchangeCodeForTokens(code);
        await storeDriveTokens(session.user.id, tokens);

        return googleRedirect(request, rollId, 'connected');
    } catch (error) {
        console.error('Error completing Google Drive OAuth:', error);
        return googleRedirect(request, rollId, 'error');
    }
}
