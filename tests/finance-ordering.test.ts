import { describe, expect, it } from 'vitest';
import { sortFinanceRules } from '@/lib/finance/rules';
import { sortFinanceTransactions } from '@/lib/finance/transactions/ordering';

function transaction(id: string, transactionDate: string, createdAt: string) {
    return { id, transaction_date: transactionDate, created_at: createdAt };
}

function rule(id: string, {
    active = true,
    createdAt = '2026-07-24T00:00:00.000Z',
    priority = 100,
}: {
    active?: boolean;
    createdAt?: string;
    priority?: number;
} = {}) {
    return { id, is_active: active, priority, created_at: createdAt };
}

describe('Finance ordering', () => {
    it('sorts transactions using the API ledger order', () => {
        const rows = [
            transaction('b', '2026-07-20', '2026-07-22T08:00:00.000Z'),
            transaction('c', '2026-07-21', '2026-07-22T07:00:00.000Z'),
            transaction('a', '2026-07-21', '2026-07-22T08:00:00.000Z'),
            transaction('b', '2026-07-21', '2026-07-22T08:00:00.000Z'),
        ];

        expect(sortFinanceTransactions(rows).map(
            ({ id, transaction_date: date }) => `${date}:${id}`
        )).toEqual([
            '2026-07-21:a',
            '2026-07-21:b',
            '2026-07-21:c',
            '2026-07-20:b',
        ]);
        expect(rows[0].transaction_date).toBe('2026-07-20');
    });

    it('moves an edited transaction to its new ledger position', () => {
        const rows = [
            transaction('newer', '2026-07-21', '2026-07-21T08:00:00.000Z'),
            transaction('edited', '2026-07-20', '2026-07-20T08:00:00.000Z'),
        ];
        const edited = { ...rows[1], transaction_date: '2026-07-22' };

        expect(sortFinanceTransactions(
            rows.map((row) => row.id === edited.id ? edited : row)
        ).map((row) => row.id)).toEqual(['edited', 'newer']);
    });

    it('sorts rules using the API Rule library order', () => {
        const rows = [
            rule('paused-urgent', { active: false, priority: 1 }),
            rule('active-later', {
                priority: 100,
                createdAt: '2026-07-24T02:00:00.000Z',
            }),
            rule('active-urgent', { priority: 1 }),
            rule('active-earlier', {
                priority: 100,
                createdAt: '2026-07-24T01:00:00.000Z',
            }),
        ];

        expect(sortFinanceRules(rows).map(({ id }) => id)).toEqual([
            'active-urgent',
            'active-later',
            'active-earlier',
            'paused-urgent',
        ]);
        expect(rows[0].id).toBe('paused-urgent');
    });

    it('reorders newly created and toggled rules', () => {
        const current = [
            rule('priority-10', { priority: 10 }),
            rule('priority-20', { priority: 20 }),
        ];
        const afterCreate = sortFinanceRules([
            rule('priority-15', { priority: 15 }),
            ...current,
        ]);
        const afterPause = sortFinanceRules(afterCreate.map((item) => (
            item.id === 'priority-10' ? { ...item, is_active: false } : item
        )));

        expect(afterCreate.map(({ id }) => id)).toEqual([
            'priority-10',
            'priority-15',
            'priority-20',
        ]);
        expect(afterPause.map(({ id }) => id)).toEqual([
            'priority-15',
            'priority-20',
            'priority-10',
        ]);
    });
});
