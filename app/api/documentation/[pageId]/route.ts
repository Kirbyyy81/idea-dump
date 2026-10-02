import { NextRequest } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { documentationData, documentationFailure } from '@/lib/documentation/core/api';
import { getDocument } from '@/lib/documentation/core/notion';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
    try {
        const session = await authorizeSessionModule('documentation');
        if ('response' in session) return session.response;
        const { pageId } = await params;
        return documentationData(await getDocument(pageId, request.signal));
    } catch (error) {
        return documentationFailure(error, 'detail');
    }
}
