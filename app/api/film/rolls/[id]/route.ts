import { NextResponse } from 'next/server';
import { applicationErrorResponse } from '@/lib/api/responses';
import { authorizeFilmJournal, jsonError } from '@/lib/film/core/api';
import { getFilmRollForUser } from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const { id } = await params;
        return NextResponse.json({ data: await getFilmRollForUser(session.user.id, id) });
    } catch (error) {
        const serviceError = applicationErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching film roll:', error);
        return jsonError('Failed to fetch film roll', 500);
    }
}
