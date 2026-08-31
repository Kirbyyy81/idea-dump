import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
    authorizeFinance: vi.fn(),
}));
const service = vi.hoisted(() => ({
    getFinanceTransactionForUser: vi.fn(),
}));

vi.mock('@/lib/finance/core/auth', () => ({
    authorizeFinance: auth.authorizeFinance,
    jsonError: (message: string, status = 400) => (
        Response.json({ error: message }, { status })
    ),
}));

vi.mock('@/lib/finance/core/service', () => ({
    getFinanceTransactionForUser: service.getFinanceTransactionForUser,
    isFinanceServiceError: () => false,
}));

import { GET } from '@/app/api/finance/transactions/[id]/route';

const transactionId = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
    vi.clearAllMocks();
    auth.authorizeFinance.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('GET /api/finance/transactions/[id]', () => {
    it('returns the authorized user transaction', async () => {
        service.getFinanceTransactionForUser.mockResolvedValue({ id: transactionId });

        const response = await GET(
            new NextRequest(`https://example.test/api/finance/transactions/${transactionId}`),
            { params: Promise.resolve({ id: transactionId }) }
        );

        expect(auth.authorizeFinance).toHaveBeenCalledOnce();
        expect(service.getFinanceTransactionForUser).toHaveBeenCalledWith(
            'user-1',
            transactionId
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ data: { id: transactionId } });
    });

    it('authorizes before rejecting an invalid transaction ID', async () => {
        const response = await GET(
            new NextRequest('https://example.test/api/finance/transactions/invalid'),
            { params: Promise.resolve({ id: 'invalid' }) }
        );

        expect(auth.authorizeFinance).toHaveBeenCalledOnce();
        expect(service.getFinanceTransactionForUser).not.toHaveBeenCalled();
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: 'Transaction ID must be a valid UUID',
        });
    });
});
