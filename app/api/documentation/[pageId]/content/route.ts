import { NextRequest } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { documentationData, documentationFailure } from '@/lib/documentation/core/api';
import { getBlockPage } from '@/lib/documentation/core/notion';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
    try {
        const session = await authorizeSessionModule('documentation');
        if ('response' in session) return session.response;
        const { pageId } = await params;
        const parentId = request.nextUrl.searchParams.get('parentId') || pageId;
        const cursor = request.nextUrl.searchParams.get('cursor');
        return documentationData(await getBlockPage(pageId, parentId, cursor, request.signal));
    } catch (error) {
        return documentationFailure(error, 'content');
    }
}
