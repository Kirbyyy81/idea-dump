import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionLedgerRow } from '@/app/finance/transactions/_components/TransactionLedgerRow';
import { FinanceTransaction } from '@/lib/types';

const transaction: FinanceTransaction = {
    id: 'transaction-1',
    user_id: 'user-1',
    source_id: 'source-1',
    category_id: 'category-1',
    intake_item_id: null,
    manual_idempotency_key: null,
    direction: 'expense',
    amount: 12,
    currency: 'MYR',
    merchant: 'BD LUCKYCUP KEPONG SDN BHD',
    payee_id: null,
    reference_number: '2608283CC79D2EO',
    transaction_date: '2026-08-28',
    notes: null,
    source: 'manual',
    status: 'confirmed',
    created_at: '2026-08-28T10:00:00Z',
    updated_at: '2026-08-28T10:00:00Z',
    finance_source: {
        id: 'source-1',
        user_id: 'user-1',
        name: 'Ryt Bank',
        filename_aliases: [],
        ocr_aliases: [],
        is_archived: false,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
    },
    category: {
        id: 'category-1',
        user_id: 'user-1',
        name: 'Drinks',
        is_archived: false,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
    },
};

describe('TransactionLedgerRow', () => {
    it('shows source and category tags without repeating the group date or reference number', () => {
        const view = render(
            <TransactionLedgerRow transaction={transaction} onEdit={vi.fn()} onDelete={vi.fn()} />
        );

        expect(screen.getByText('Ryt Bank')).toBeTruthy();
        expect(screen.getByText('Drinks')).toBeTruthy();
        expect(screen.queryByText('28 Aug 2026')).toBeNull();
        expect(screen.queryByText(/2608283CC79D2EO/)).toBeNull();
        const iconTile = view.container.querySelector('[data-ledger-category-icon="food"]');
        expect(iconTile).toBeTruthy();
        expect(iconTile?.className).toContain('bg-error-bg');
    });

    it('uses the income tile tone while keeping a general category fallback', () => {
        const view = render(
            <TransactionLedgerRow
                transaction={{
                    ...transaction,
                    direction: 'income',
                    category: transaction.category
                        ? { ...transaction.category, name: 'Hackathon' }
                        : null,
                }}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        const iconTile = view.container.querySelector('[data-ledger-category-icon="general"]');
        expect(iconTile).toBeTruthy();
        expect(iconTile?.className).toContain('bg-success-bg');
    });

    it('keeps edit and delete inside the transaction action popover', () => {
        const onEdit = vi.fn();
        const onDelete = vi.fn();
        render(
            <TransactionLedgerRow
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        );

        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();

        const trigger = screen.getByRole('button', {
            name: 'Actions for BD LUCKYCUP KEPONG SDN BHD',
        });
        fireEvent.click(trigger);
        const editButton = screen.getByRole('button', { name: 'Edit' });
        const deleteButton = screen.getByRole('button', { name: 'Delete' });
        expect(editButton.tabIndex).toBe(0);
        expect(deleteButton.tabIndex).toBe(0);
        fireEvent.click(editButton);
        expect(onEdit).toHaveBeenCalledWith(transaction);
        expect(screen.queryByRole('group', { name: 'Actions for BD LUCKYCUP KEPONG SDN BHD' })).toBeNull();
        expect(document.activeElement).toBe(trigger);

        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledWith(transaction);
        expect(screen.queryByRole('group', { name: 'Actions for BD LUCKYCUP KEPONG SDN BHD' })).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('closes on Escape or an outside interaction without activating an action', () => {
        const onEdit = vi.fn();
        const onDelete = vi.fn();
        render(
            <TransactionLedgerRow
                transaction={transaction}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        );
        const trigger = screen.getByRole('button', {
            name: 'Actions for BD LUCKYCUP KEPONG SDN BHD',
        });

        fireEvent.click(trigger);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('group', { name: 'Actions for BD LUCKYCUP KEPONG SDN BHD' })).toBeNull();
        expect(document.activeElement).toBe(trigger);

        fireEvent.click(trigger);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('group', { name: 'Actions for BD LUCKYCUP KEPONG SDN BHD' })).toBeNull();
        expect(onEdit).not.toHaveBeenCalled();
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('uses clear fallback tags when reference data is unavailable', () => {
        render(
            <TransactionLedgerRow
                transaction={{ ...transaction, finance_source: null, category: null }}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        expect(screen.getByText('Unknown source')).toBeTruthy();
        expect(screen.getByText('Uncategorised')).toBeTruthy();
    });
});
