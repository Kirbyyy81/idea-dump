import { describe, expect, it, vi } from 'vitest';
import AddFinanceTransactionPage from '@/app/finance/add/page';
import { FinanceTransactionEntry } from '@/app/finance/add/_components/FinanceTransactionEntry';

vi.mock('@/app/finance/add/_components/FinanceTransactionEntry', () => ({
    FinanceTransactionEntry: () => null,
}));

describe('Finance transaction entry mode', () => {
    it.each([
        ['manual', 'manual'],
        ['screenshot', 'screenshot'],
    ] as const)('opens the requested %s workflow', async (value, expected) => {
        const page = await AddFinanceTransactionPage({ searchParams: Promise.resolve({ mode: value }) });
        expect(page.type).toBe(FinanceTransactionEntry);
        expect(page.props.initialMode).toBe(expected);
    });

    it.each([
        undefined,
        'unknown',
        '',
        [],
        ['manual'],
        ['manual', 'screenshot'],
    ])('defaults to screenshot for %j', async (value) => {
        const page = await AddFinanceTransactionPage({ searchParams: Promise.resolve({ mode: value }) });
        expect(page.props.initialMode).toBe('screenshot');
    });
});
