import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, jsonError } from '@/lib/film/core/api';
import { getFilmGoogleAuthorizationUrl } from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const url = new URL(request.url);
        const rollId = url.searchParams.get('roll_id');

        const state = crypto.randomBytes(16).toString('hex');
        const response = NextResponse.redirect(getFilmGoogleAuthorizationUrl(state));
        response.cookies.set('film_google_oauth_state', state, {
            httpOnly: true,
            maxAge: 60 * 10,
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        });

        if (rollId && UUID_REGEX.test(rollId)) {
            response.cookies.set('film_google_oauth_roll_id', rollId, {
                httpOnly: true,
                maxAge: 60 * 10,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            });
        }

        return response;
    } catch (error) {
        console.error('Error starting Google Drive OAuth:', error);
        return jsonError('Failed to start Google Drive connection', 500);
    }
}
