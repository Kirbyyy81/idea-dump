import { describe, expect, it } from 'vitest';
import { createFinanceTransactionEditForm } from '@/app/finance/transactions/edit/_components/transactionEditForm';
import { getFinanceTransactionEditId } from '@/app/finance/transactions/edit/transactionEditRoute';
import type { FinanceTransaction } from '@/lib/types';

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

describe('Finance transaction edit route', () => {
    it('accepts one valid transaction ID', () => {
        expect(getFinanceTransactionEditId(transaction.id)).toBe(transaction.id);
    });

    it.each([
        ['missing', undefined],
        ['invalid', 'not-a-uuid'],
        ['empty repeated', []],
        ['repeated', [transaction.id, transaction.id]],
    ])('rejects a %s transaction ID', (_label, value) => {
        expect(getFinanceTransactionEditId(value)).toBeNull();
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
