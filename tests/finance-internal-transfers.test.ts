import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateFinanceDashboard } from '@/lib/finance/dashboard';
import { groupFinanceLedgerTransactions } from '@/app/finance/transactions/_components/transactionLedger';
import { financeTransactionsHref, parseFinanceTransactionFilters } from '@/lib/finance/transactions/filters';
import { toFinanceTransactionView } from '@/lib/finance/core/payloads';
import type { FinanceTransaction, FinanceTransactionView } from '@/lib/types';

const repo = vi.hoisted(() => ({ listFinanceDuplicateCandidates: vi.fn() }));
vi.mock('@/lib/finance/core/repository', () => repo);
import { assessFinanceDuplicate } from '@/lib/finance/transactions/duplicates';

const row = (direction: 'expense' | 'income', transfer_id: string | null = 'transfer') => ({
    id: direction, transfer_id, direction, amount: 100, currency: 'MYR' as const, transaction_date: '2026-11-19',
    source_id: direction === 'expense' ? 'ryt' : 'tng', category_id: 'food', category: { name: 'Food' },
});

beforeEach(() => vi.clearAllMocks());
describe('Finance internal transfer accounting', () => {
    it('excludes both movements from income, expenses, categories and daily cash flow', () => {
        expect(aggregateFinanceDashboard([row('expense'), row('income')])).toEqual({
            total_expense: 0, total_income: 0, net_cash_flow: 0, net_by_category: [], daily_cash_flow: [],
        });
        expect(aggregateFinanceDashboard([row('expense'), row('income'), row('expense', null)]).total_expense).toBe(100);
    });
    it('keeps both ledger entries visible while excluding them from group totals', () => {
        const rows = [row('expense'), row('income')] as FinanceTransactionView[];
        expect(groupFinanceLedgerTransactions(rows)).toMatchObject([{ transactions: rows, expenseTotal: 0, incomeTotal: 0 }]);
    });
    it('accepts and preserves the transfer filter without adding a transaction direction', () => {
        expect(parseFinanceTransactionFilters(new URLSearchParams('direction=transfer'))).toMatchObject({ data: { direction: 'transfer' } });
        expect(financeTransactionsHref({ direction: 'transfer' })).toBe('/finance/transactions?direction=transfer');
    });
    it('carries transfer membership into the ledger response', () => {
        expect(toFinanceTransactionView(row('expense') as FinanceTransaction)).toMatchObject({ transfer_id: 'transfer', direction: 'expense' });
    });
});

describe('Direction-aware duplicate checks', () => {
    const input = { userId: 'owner', amount: 100, direction: 'income' as const, currency: 'MYR' as const, merchant: 'Owner',
        transactionDate: '2026-11-19', sourceId: 'tng', referenceNumber: null };
    const saved = { ...row('expense', null), merchant: 'Owner', intake_item_id: null, reference_number: null };
    it('does not label opposite movements across accounts as amount/date duplicates', async () => {
        repo.listFinanceDuplicateCandidates.mockResolvedValue({ transactions: [saved], textHashTransactionIds: new Set() });
        expect((await assessFinanceDuplicate(input)).outcome).toBe('none');
    });
    it('retains duplicate evidence for reimporting the same leg', async () => {
        repo.listFinanceDuplicateCandidates.mockResolvedValue({ transactions: [{ ...saved, direction: 'income', source_id: 'tng' }], textHashTransactionIds: new Set() });
        expect((await assessFinanceDuplicate(input)).outcome).toBe('strong');
    });
    it('retains identical OCR evidence when the direction was parsed incorrectly', async () => {
        repo.listFinanceDuplicateCandidates.mockResolvedValue({ transactions: [saved], textHashTransactionIds: new Set([saved.id]) });
        expect((await assessFinanceDuplicate(input)).signals).toContain('ocr_text_hash');
    });
});
