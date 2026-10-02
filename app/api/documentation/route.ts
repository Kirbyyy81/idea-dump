import { NextRequest } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { documentationData, documentationFailure } from '@/lib/documentation/core/api';
import { listDocuments } from '@/lib/documentation/core/notion';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('documentation');
        if ('response' in session) return session.response;
        const cursor = request.nextUrl.searchParams.get('cursor');
        return documentationData(await listDocuments(cursor, request.signal));
    } catch (error) {
        return documentationFailure(error, 'list');
    }
}
