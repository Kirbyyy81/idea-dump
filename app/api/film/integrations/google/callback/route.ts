import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, jsonError } from '@/lib/film/api';
import { exchangeCodeForTokens, storeDriveTokens } from '@/lib/film/googleDrive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const expectedState = request.cookies.get('film_google_oauth_state')?.value;

        if (!code) return jsonError('Missing Google authorization code');
        if (!state || !expectedState || state !== expectedState) {
            return jsonError('Invalid Google OAuth state', 400);
        }

        const tokens = await exchangeCodeForTokens(code);
        await storeDriveTokens(session.user.id, tokens);

        const response = NextResponse.redirect(new URL('/film?google=connected', request.url));
        response.cookies.delete('film_google_oauth_state');
        return response;
    } catch (error) {
        console.error('Error completing Google Drive OAuth:', error);
        return jsonError('Failed to complete Google Drive connection', 500);
    }
}
