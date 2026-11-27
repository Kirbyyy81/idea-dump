import { NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { isFilmServiceError } from './service';

export function authorizeFilmJournal() {
    return authorizeSessionModule('film_journal');
}

export function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

export function filmServiceErrorResponse(error: unknown) {
    return isFilmServiceError(error) ? jsonError(error.message, error.status) : null;
}
