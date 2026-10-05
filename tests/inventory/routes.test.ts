import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { findModuleRouteRule } from '@/lib/rbac/routes';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), access: vi.fn(), read: vi.fn(), write: vi.fn(), expenses: vi.fn() }));
vi.mock('@/lib/rbac/guards', () => ({ authorizeSessionModule: mocks.authorize }));
vi.mock('@/lib/rbac/access', () => ({ canAccessModule: mocks.access }));
vi.mock('@/lib/inventory/core/service', () => ({ getInventory: mocks.read, mutateInventory: mocks.write, getInventoryExpenses: mocks.expenses }));
import { GET, POST } from '@/app/api/inventory/route';
import { GET as expenses } from '@/app/api/inventory/expenses/route';
const request = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const command = { request_id: '16000000-0000-4000-8000-000000000099', action: 'start', payload: { batch_id: '16000000-0000-4000-8000-000000000031', started_on: '2026-01-01' } };
beforeEach(() => {
    vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ user: { id: 'verified-owner' }, access: {} }); mocks.access.mockReturnValue(true); mocks.read.mockResolvedValue({}); mocks.write.mockResolvedValue({ id: 'saved' }); mocks.expenses.mockResolvedValue({ expenses: [], total: 0 });
});
describe('Inventory API authorization', () => {
    it.each([401, 403])('enforces the shared guard (%s)', async (status) => {
        mocks.authorize.mockResolvedValue({ response: NextResponse.json({ error: 'Denied' }, { status }) });
        expect((await GET()).status).toBe(status); expect((await POST(request(command))).status).toBe(status);
        expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
    });
    it('uses verified identity and guards the inventory route prefix', async () => {
        expect((await POST(request({ ...command, user_id: 'untrusted' }))).status).toBe(200);
        expect(mocks.authorize).toHaveBeenCalledWith('inventory');
        expect(mocks.write).toHaveBeenCalledWith('verified-owner', command);
        expect(findModuleRouteRule('/inventory/products')).toMatchObject({ module: 'inventory' });
        expect(findModuleRouteRule('/inventory-other')).toBeUndefined();
    });
    it.each<Record<string, string>>([{ Origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }, { Origin: 'null' }])('rejects cross-origin mutations', async (headers) => {
        expect((await POST(request(command, headers))).status).toBe(403); expect(mocks.write).not.toHaveBeenCalled();
    });
    it('rejects unsupported content types and invalid bodies', async () => {
        expect((await POST(request(command, { 'Content-Type': 'text/plain' }))).status).toBe(415);
        expect((await POST(request({ ...command, payload: {} }))).status).toBe(422);
        expect(mocks.write).not.toHaveBeenCalled();
    });
    it('requires Finance access for expense discovery and linking', async () => {
        mocks.access.mockReturnValue(false);
        expect((await expenses(new NextRequest('http://localhost/api/inventory/expenses'))).status).toBe(403);
        expect((await POST(request({ ...command, action: 'link_finance', payload: { purchase_id: command.payload.batch_id, finance_transaction_id: null } }))).status).toBe(403);
        expect(mocks.expenses).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
    });
    it('validates expense pagination and keeps snapshots uncached', async () => {
        expect((await expenses(new NextRequest('http://localhost/api/inventory/expenses?page=0'))).status).toBe(422);
        expect((await GET()).headers.get('Cache-Control')).toBe('private, no-store');
    });
});
