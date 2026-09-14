import { NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';

export async function authorizeFilmJournal() {
    const access = await authorizeSessionModule('film_journal');
    if ('response' in access) {
        return access;
    }

    return access;
}

export function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}
