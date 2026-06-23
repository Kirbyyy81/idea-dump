import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorizeFilmJournal, jsonError } from '@/lib/film/api';
import { getGoogleAuthUrl } from '@/lib/film/googleDrive';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;

        const state = crypto.randomBytes(16).toString('hex');
        const response = NextResponse.redirect(getGoogleAuthUrl(state));
        response.cookies.set('film_google_oauth_state', state, {
            httpOnly: true,
            maxAge: 60 * 10,
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        });

        return response;
    } catch (error) {
        console.error('Error starting Google Drive OAuth:', error);
        return jsonError('Failed to start Google Drive connection', 500);
    }
}
