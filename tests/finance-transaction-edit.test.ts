import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceTransactionEditForm } from '@/app/finance/transactions/edit/_components/transactionEditForm';
import { ApplicationError } from '@/lib/api/applicationError';
import type { FinanceTransaction } from '@/lib/types';

const server = vi.hoisted(() => ({
    getFinanceTransactionForUser: vi.fn(),
    getSessionUser: vi.fn(),
}));

vi.mock('@/lib/rbac/access', () => ({
    getSessionUser: server.getSessionUser,
}));

vi.mock('@/lib/finance/core/service', () => ({
    getFinanceTransactionForUser: server.getFinanceTransactionForUser,
}));

import FinanceTransactionEditRoute from '@/app/finance/transactions/edit/page';

const transaction: FinanceTransaction = {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: 'user-1',
    source_id: 'source-1',
    category_id: 'category-1',
    intake_item_id: null,
    manual_idempotency_key: null,
    direction: 'expense',
    amount: 12.5,
    currency: 'MYR',
    merchant: 'Coffee shop',
    payee_id: 'payee-1',
    reference_number: 'reference-1',
    transaction_date: '2026-08-31',
    notes: 'Team breakfast',
    source: 'manual',
    status: 'confirmed',
    created_at: '2026-08-31T08:00:00Z',
    updated_at: '2026-08-31T08:00:00Z',
    finance_payee: {
        id: 'payee-1',
        user_id: 'user-1',
        name: 'Coffee shop account',
        normalized_name: 'coffee shop account',
        is_archived: false,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
    },
};

interface EditorProps {
    canRetry: boolean;
    initialTransaction: FinanceTransaction | null;
    loadError: string | null;
}

async function getEditorProps(id?: string | string[]) {
    const element = await FinanceTransactionEditRoute({
        searchParams: Promise.resolve(id === undefined ? {} : { id }),
    });
    return element.props as EditorProps;
}

beforeEach(() => {
    vi.clearAllMocks();
    server.getSessionUser.mockResolvedValue({ id: 'user-1' });
});

describe('Finance transaction edit route', () => {
    it('loads one valid transaction for the authenticated user on the server', async () => {
        server.getFinanceTransactionForUser.mockResolvedValue(transaction);

        const props = await getEditorProps(transaction.id);

        expect(server.getFinanceTransactionForUser).toHaveBeenCalledWith(
            'user-1',
            transaction.id
        );
        expect(props).toMatchObject({
            canRetry: false,
            initialTransaction: transaction,
            loadError: null,
        });
    });

    it.each([
        ['missing', undefined],
        ['invalid', 'not-a-uuid'],
        ['empty repeated', []],
        ['repeated', [transaction.id, transaction.id]],
    ])('rejects a %s transaction ID before loading data', async (_label, value) => {
        const props = await getEditorProps(value);

        expect(server.getSessionUser).not.toHaveBeenCalled();
        expect(server.getFinanceTransactionForUser).not.toHaveBeenCalled();
        expect(props).toMatchObject({
            canRetry: false,
            initialTransaction: null,
            loadError: 'Transaction not found.',
        });
    });

    it('shows a safe domain error without offering an ineffective retry', async () => {
        const serviceError = new ApplicationError('Transaction not found', { status: 404 });
        server.getFinanceTransactionForUser.mockRejectedValue(serviceError);

        const props = await getEditorProps(transaction.id);

        expect(props).toMatchObject({
            canRetry: false,
            initialTransaction: null,
            loadError: 'Transaction not found',
        });
    });

    it('keeps unexpected server failures retryable without exposing details', async () => {
        server.getFinanceTransactionForUser.mockRejectedValue(
            new Error('private database detail')
        );
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const props = await getEditorProps(transaction.id);

        expect(props).toMatchObject({
            canRetry: true,
            initialTransaction: null,
            loadError: 'Could not load transaction.',
        });
        expect(consoleError).toHaveBeenCalledWith(
            'Could not load the Finance transaction editor',
            expect.objectContaining({ transactionId: transaction.id })
        );
        consoleError.mockRestore();
    });

    it('creates the editable form from the loaded transaction', () => {
        expect(createFinanceTransactionEditForm(transaction)).toEqual({
            amount: '12.5',
            category_id: 'category-1',
            direction: 'expense',
            has_payee: true,
            merchant: 'Coffee shop',
            notes: 'Team breakfast',
            payee_name: 'Coffee shop account',
            reference_number: 'reference-1',
            source_id: 'source-1',
            transaction_date: '2026-08-31',
        });
    });
});
