import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { InventoryError } from './validation';

export async function authorizeInventory(request?: NextRequest) {
    const session = await authorizeSessionModule('inventory');
    if ('response' in session || !request || request.method === 'GET') return session;
    const origin = request.headers.get('origin');
    let invalidOrigin = request.headers.get('sec-fetch-site') === 'cross-site';
    try { if (origin && new URL(origin).origin !== request.nextUrl.origin) invalidOrigin = true; }
    catch { invalidOrigin = true; }
    if (invalidOrigin) return { response: NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 }) };
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return { response: NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 }) };
    }
    return session;
}
export function inventoryResponseError(error: unknown) {
    if (error instanceof InventoryError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Inventory request failed');
    return NextResponse.json({ error: 'Could not load or save inventory. Please retry.' }, { status: 500 });
}
