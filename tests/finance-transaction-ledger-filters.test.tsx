import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionLedgerFilters } from '@/app/finance/transactions/_components/TransactionLedgerFilters';
import { getFinanceLedgerPeriodRange } from '@/app/finance/transactions/_components/transactionLedger';
import { getLocalFinanceDate } from '@/lib/finance/core/values';
import { FinanceTransaction } from '@/lib/types';

const navigation = vi.hoisted(() => ({
    pathname: '/finance/transactions',
    replace: vi.fn(),
    searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ replace: navigation.replace }),
    useSearchParams: () => navigation.searchParams,
}));

const historicalTransaction: FinanceTransaction = {
    id: 'transaction-1',
    user_id: 'user-1',
    source_id: 'source-archived',
    category_id: 'category-archived',
    intake_item_id: null,
    manual_idempotency_key: null,
    direction: 'expense',
    amount: 12,
    currency: 'MYR',
    merchant: 'Historical purchase',
    payee_id: null,
    reference_number: null,
    transaction_date: '2026-08-28',
    notes: null,
    source: 'manual',
    status: 'confirmed',
    created_at: '2026-08-28T10:00:00Z',
    updated_at: '2026-08-28T10:00:00Z',
    finance_source: {
        id: 'source-archived',
        user_id: 'user-1',
        name: 'Old Wallet',
        filename_aliases: [],
        ocr_aliases: [],
        is_archived: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    },
    category: {
        id: 'category-archived',
        user_id: 'user-1',
        name: 'Old Category',
        is_archived: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    },
};

function renderFilters(overrides: Partial<ComponentProps<typeof TransactionLedgerFilters>> = {}) {
    return render(
        <TransactionLedgerFilters
            categories={[{ id: '00000000-0000-4000-8000-000000000003', name: 'Drinks' }]}
            error={null}
            onQueryChange={vi.fn()}
            query=""
            refresh={vi.fn().mockResolvedValue(undefined)}
            sources={[{ id: '00000000-0000-4000-8000-000000000002', name: 'Ryt Bank' }]}
            status="ready"
            transactions={[historicalTransaction]}
            {...overrides}
        />
    );
}

function latestReplacement() {
    const [url, options] = navigation.replace.mock.calls.at(-1) || [];
    return {
        options,
        pathname: new URL(String(url), 'https://example.test').pathname,
        searchParams: new URL(String(url), 'https://example.test').searchParams,
    };
}

beforeEach(() => {
    navigation.replace.mockReset();
    navigation.searchParams = new URLSearchParams();
});

describe('TransactionLedgerFilters', () => {
    it('keeps controls visible on desktop and toggles them from the mobile button', () => {
        renderFilters();

        const toggle = screen.getByRole('button', { name: 'Filters' });
        const panel = document.getElementById('transaction-ledger-filters');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(panel?.className).toContain('hidden');
        expect(panel?.className).toContain('md:contents');
        expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ledger period' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ledger source' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ledger category' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ledger transaction type' })).toBeTruthy();

        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel?.className).toContain('grid');
    });

    it('keeps search local while placing it in the filter toolbar', () => {
        const onQueryChange = vi.fn();
        renderFilters({ query: 'coffee', onQueryChange });

        const search = screen.getByRole('textbox', { name: 'Search' });
        expect((search as HTMLInputElement).value).toBe('coffee');
        fireEvent.change(search, { target: { value: 'kopitiam' } });

        expect(onQueryChange).toHaveBeenCalledWith('kopitiam');
        expect(navigation.replace).not.toHaveBeenCalled();
    });

    it('updates combined URL filters immediately and includes archived history options', () => {
        renderFilters();
        const today = getLocalFinanceDate();
        const thisMonth = getFinanceLedgerPeriodRange('this_month', today);

        fireEvent.click(screen.getByRole('combobox', { name: 'Ledger period' }));
        fireEvent.click(screen.getByRole('option', { name: 'This month' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'Ledger source' }));
        expect(screen.getByRole('option', { name: 'Old Wallet (archived)' })).toBeTruthy();
        fireEvent.click(screen.getByRole('option', { name: 'Ryt Bank' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'Ledger transaction type' }));
        fireEvent.click(screen.getByRole('option', { name: 'Expense' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'Ledger category' }));
        fireEvent.click(screen.getByRole('option', { name: 'Uncategorised' }));

        const replacement = latestReplacement();
        expect(replacement.pathname).toBe('/finance/transactions');
        expect(replacement.searchParams.get('date_from')).toBe(thisMonth.dateFrom);
        expect(replacement.searchParams.get('date_to')).toBe(thisMonth.dateTo);
        expect(replacement.searchParams.get('source_id'))
            .toBe('00000000-0000-4000-8000-000000000002');
        expect(replacement.searchParams.get('direction')).toBe('expense');
        expect(replacement.searchParams.get('uncategorised')).toBe('true');
        expect(replacement.options).toEqual({ scroll: false });
    });

    it('clears a conflicting custom boundary while applying the selected date', () => {
        navigation.searchParams = new URLSearchParams({
            date_from: '2026-08-20',
            date_to: '2026-08-30',
        });
        renderFilters();

        fireEvent.click(screen.getByRole('button', { name: /Ledger start date, 20 Aug 2026/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Monday, August 31, 2026' }));

        const replacement = latestReplacement();
        expect(replacement.searchParams.get('date_from')).toBe('2026-08-31');
        expect(replacement.searchParams.has('date_to')).toBe(false);
    });

    it('maps an exact-date link into custom boundaries and clears filters', () => {
        navigation.searchParams = new URLSearchParams({ date: '2026-08-28' });
        renderFilters();

        expect(screen.getByText('Date: 28 Aug 2026')).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ledger period' }).textContent)
            .toContain('Custom');
        expect(screen.getByRole('button', { name: /Ledger start date, 28 Aug 2026/ }))
            .toBeTruthy();
        expect(screen.getByRole('button', { name: /Ledger end date, 28 Aug 2026/ }))
            .toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Clear ledger start date' }));
        let replacement = latestReplacement();
        expect(replacement.searchParams.has('date')).toBe(false);
        expect(replacement.searchParams.has('date_from')).toBe(false);
        expect(replacement.searchParams.get('date_to')).toBe('2026-08-28');

        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        replacement = latestReplacement();
        expect(replacement.pathname).toBe('/finance/transactions');
        expect([...replacement.searchParams.keys()]).toEqual([]);
    });

    it('keeps date and type available when reference filters fail', () => {
        renderFilters({ status: 'error', error: 'Reference data failed' });

        expect((screen.getByRole('combobox', { name: 'Ledger period' }) as HTMLButtonElement).disabled)
            .toBe(false);
        expect((screen.getByRole('combobox', { name: 'Ledger transaction type' }) as HTMLButtonElement).disabled)
            .toBe(false);
        expect((screen.getByRole('combobox', { name: 'Ledger source' }) as HTMLButtonElement).disabled)
            .toBe(true);
        expect((screen.getByRole('combobox', { name: 'Ledger category' }) as HTMLButtonElement).disabled)
            .toBe(true);
        expect(screen.getByRole('alert').textContent).toContain('Reference data failed');
        expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });
});
