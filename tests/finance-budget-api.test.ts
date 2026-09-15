import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '@/app/api/finance/budgets/route';
import { GET as detailGET, PATCH } from '@/app/api/finance/budgets/[id]/route';
import { FinanceServiceError } from '@/lib/finance/core/errors';
import { budgetConfiguration, budgetDetailFixture, budgetFixture } from './fixtures/finance-budgets';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), detail: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/finance/core/auth', async (original) => ({ ...await original<typeof import('@/lib/finance/core/auth')>(), authorizeFinance: mocks.auth }));
vi.mock('@/lib/finance/budgets/service', () => ({ getFinanceBudgets: mocks.list, getFinanceBudgetDetail: mocks.detail, mutateFinanceBudget: mocks.mutate }));
const context = () => ({ params: Promise.resolve({ id: budgetFixture().id }) });
const request = (method: string, body?: unknown, suffix = '') => new NextRequest(`http://localhost/api/finance/budgets${suffix}`, { method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(body) }) });
beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'verified-owner' } }); mocks.mutate.mockResolvedValue(budgetFixture()); mocks.detail.mockResolvedValue(budgetDetailFixture());
});
describe('budget route authorization and contracts', () => {
    it.each([401, 403])('rejects %s before querying data', async (status) => {
        mocks.auth.mockResolvedValue({ response: new Response(null, { status }) });
        expect((await GET(request('GET'))).status).toBe(status);
        expect((await POST(request('POST', {}))).status).toBe(status);
        expect((await detailGET(request('GET'), context())).status).toBe(status);
        expect((await PATCH(request('PATCH', {}), context())).status).toBe(status);
        expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
    });
    it('creates with verified ownership and Finance JSON security', async () => {
        const req = request('POST', { request_id: budgetFixture().id, configuration: { ...budgetConfiguration, start_date: '2099-01-01' } });
        expect((await POST(req)).status).toBe(201);
        expect(mocks.auth).toHaveBeenCalledWith(req, { requireJson: true });
        expect(mocks.mutate).toHaveBeenCalledWith('verified-owner', expect.objectContaining({ action: 'create', request_id: budgetFixture().id }));
    });
    it('passes validated list and independent detail pagination', async () => {
        mocks.list.mockResolvedValue({ data: [], page: 2, page_size: 20, total: 0 });
        expect((await GET(request('GET', undefined, '?state=archived&page=2'))).status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith('verified-owner', { state: 'archived', page: 2, page_size: 20 });
        await detailGET(request('GET', undefined, '?history_page=2&transactions_page=3'), context());
        expect(mocks.detail).toHaveBeenCalledWith('verified-owner', budgetFixture().id, expect.objectContaining({ history_page: 2, transactions_page: 3 }));
    });
    it('maps concurrent writes to a safe conflict', async () => {
        mocks.mutate.mockRejectedValue(new FinanceServiceError('Reload and retry', 409));
        const result = await PUT(request('PUT', { id: budgetFixture().id, revision: 1, configuration: budgetConfiguration }));
        expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'Reload and retry' });
    });
    it('rejects invalid references, pagination, body and action', async () => {
        expect((await GET(request('GET', undefined, '?page=0'))).status).toBe(400);
        expect((await POST(request('POST', []))).status).toBe(400);
        expect((await PATCH(request('PATCH', { action: 'delete', revision: 1 }), context())).status).toBe(400);
        expect((await PUT(request('PUT', { id: budgetFixture().id, revision: 1, configuration: { ...budgetConfiguration, source_ids: ['bad'] } }))).status).toBe(422);
        expect(mocks.mutate).not.toHaveBeenCalled();
    });
    it('does not expose database failure content', async () => {
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.detail.mockRejectedValue(new Error('private account details'));
        const response = await detailGET(request('GET'), context());
        expect(response.status).toBe(500); expect(await response.text()).not.toContain('private account');
        logger.mockRestore();
    });
});
