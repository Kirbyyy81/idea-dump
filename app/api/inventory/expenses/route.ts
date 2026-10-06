import { NextRequest, NextResponse } from 'next/server';
import { canAccessModule } from '@/lib/rbac/access';
import { authorizeInventory, inventoryResponseError } from '@/lib/inventory/core/auth';
import { getInventoryExpenses } from '@/lib/inventory/core/service';
import { InventoryError } from '@/lib/inventory/core/validation';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeInventory();
        if ('response' in session) return session.response;
        if (!canAccessModule(session.access, 'finance')) throw new InventoryError('Finance access is required to link expenses.', 403);
        const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
        const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
        if (query.length > 120 || !Number.isInteger(page) || page < 1 || page > 10000) throw new InventoryError('Enter valid search options.');
        return NextResponse.json({ data: await getInventoryExpenses(session.user.id, query, page) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return inventoryResponseError(error); }
}
