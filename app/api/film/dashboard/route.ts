import { NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/api';
import { getFilmDashboardForUser } from '@/lib/film/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFilmDashboardForUser(session.user.id) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching film dashboard:', error);
        return jsonError('Failed to fetch film dashboard', 500);
    }
}
