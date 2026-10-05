import { NextRequest, NextResponse } from 'next/server';
import { canAccessModule } from '@/lib/rbac/access';
import { authorizeInventory, inventoryResponseError } from '@/lib/inventory/core/auth';
import { getInventory, mutateInventory } from '@/lib/inventory/core/service';
import { InventoryError, parseInventoryMutation } from '@/lib/inventory/core/validation';

export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const session = await authorizeInventory();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getInventory(session.user.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return inventoryResponseError(error); }
}
export async function POST(request: NextRequest) {
    try {
        const session = await authorizeInventory(request);
        if ('response' in session) return session.response;
        const raw = await request.text();
        if (raw.length > 100000) throw new InventoryError('The cart is too large.', 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { throw new InventoryError('Enter valid inventory details.'); }
        const mutation = parseInventoryMutation(body);
        if ((mutation.action === 'link_finance' || (mutation.action === 'edit_purchase' && mutation.payload.finance_transaction_id !== undefined)) && !canAccessModule(session.access, 'finance')) throw new InventoryError('Finance access is required to link expenses.', 403);
        return NextResponse.json({ data: await mutateInventory(session.user.id, mutation) });
    } catch (error) { return inventoryResponseError(error); }
}
