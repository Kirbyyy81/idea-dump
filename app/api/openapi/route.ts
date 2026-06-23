import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/lib/openapi';
import { authorizeSessionModule } from '@/lib/rbac/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
    const access = await authorizeSessionModule('api');
    if ('response' in access) {
        return access.response;
    }

    return NextResponse.json(getOpenApiSpec());
}

