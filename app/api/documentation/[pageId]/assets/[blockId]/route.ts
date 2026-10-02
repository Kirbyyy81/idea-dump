import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { documentationAssetHeaders, documentationFailure } from '@/lib/documentation/core/api';
import { getAsset } from '@/lib/documentation/core/notion';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string; blockId: string }> }) {
    try {
        const session = await authorizeSessionModule('documentation');
        if ('response' in session) return session.response;
        const { pageId, blockId } = await params;
        const asset = await getAsset(pageId, blockId, request.signal);
        return new NextResponse(asset.bytes, { headers: documentationAssetHeaders(asset.contentType) });
    } catch (error) {
        return documentationFailure(error, 'asset');
    }
}
