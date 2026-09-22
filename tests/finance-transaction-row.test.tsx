import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinanceTransactionRow } from '@/app/finance/_components/FinanceTransactionRow';

describe('shared Finance transaction row', () => {
    it.each(['default', 'compact'] as const)('keeps the same information and visual vocabulary in %s density', (density) => {
        const { container } = render(<FinanceTransactionRow density={density} payeeName="Alex" merchant="Cafe" sourceName="Bank" categoryName="Food" date="2026-09-21" direction="expense" formattedAmount="RM 12.30" />);
        expect(container.querySelector(`[data-finance-transaction-row="${density}"]`)).toBeTruthy();
        expect(container.querySelector('[data-ledger-category-icon="food"]')?.className).toContain('bg-error-bg');
        expect(screen.getByText('Alex')).toBeTruthy();
        expect(screen.getByText('Merchant: Cafe')).toBeTruthy();
        expect(screen.getByText('Bank')).toBeTruthy();
        expect(screen.getByText('Food')).toBeTruthy();
        expect(screen.getByText('2026-09-21').getAttribute('datetime')).toBe('2026-09-21');
        expect(screen.getByText('RM 12.30').className).toContain('text-error');
        expect(screen.getByText('Expense')).toBeTruthy();
    });

    it('preserves selection, warnings and missing data without interactive descendants', () => {
        const onSelect = vi.fn();
        render(<FinanceTransactionRow density="compact" onSelect={onSelect} selected categoryName={null} date={null} formattedAmount={null} status={<span>Possible duplicate</span>} />);
        const row = screen.getByRole('button', { pressed: true });
        expect(row.className).toContain('border-l-accent-blue');
        expect(row.querySelector('button, a')).toBeNull();
        for (const text of ['Untitled transaction', 'Unknown source', 'Uncategorised', 'No date', 'No amount', 'Possible duplicate']) expect(screen.getByText(text)).toBeTruthy();
        fireEvent.click(row);
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it('keeps a link row padded and formats zero income without inventing unavailable category data', () => {
        render(<FinanceTransactionRow density="compact" href="/finance/transactions/edit?id=one" direction="income" formattedAmount="RM 0.00" merchant="Refund" />);
        const row = screen.getByRole('link');
        expect(row.getAttribute('href')).toBe('/finance/transactions/edit?id=one');
        expect(row.className).toContain('px-3');
        expect(row.querySelector('button, a')).toBeNull();
        expect(screen.getByText('RM 0.00').className).toContain('text-success');
        expect(screen.queryByText('Uncategorised')).toBeNull();
        expect(screen.getByText('Income')).toBeTruthy();
    });
});
