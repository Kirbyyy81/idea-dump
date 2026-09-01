import { NextResponse } from 'next/server';
import { applicationErrorResponse } from '@/lib/api/responses';
import { authorizeFilmJournal, jsonError } from '@/lib/film/core/api';
import { getFilmDashboardForUser } from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFilmDashboardForUser(session.user.id) });
    } catch (error) {
        const serviceError = applicationErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching film dashboard:', error);
        return jsonError('Failed to fetch film dashboard', 500);
    }
}
