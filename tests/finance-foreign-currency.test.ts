import { describe, expect, it } from 'vitest';
import { parseFinanceNotification } from '@/lib/finance/notifications/parser';
import { learnNotificationPattern } from '@/lib/finance/notifications/learning';
import { formatFinanceForeignDetails, parseForeignDetails } from '@/lib/finance/transactions/foreignCurrency';
import { parseFinanceTransaction } from '@/lib/finance/core/schemas';
import { hasFinanceTravelTag } from '@/lib/finance/tagValues';
import { isManualTransactionReplay } from '@/lib/finance/transactions/idempotency';
import type { FinanceNotificationEventInput, FinanceNotificationPattern, FinanceTransaction } from '@/lib/types';
import { notificationPatterns } from './fixtures/notification-patterns';

const foreign = { foreign_amount: '1600', foreign_currency: 'TWD' };
const user = '10000000-0000-4000-8000-000000000001';
const source = '10000000-0000-4000-8000-000000000002';
const event = (text: string): FinanceNotificationEventInput => ({
    client_event_id: '10000000-0000-4000-8000-000000000003',
    source_id: source, source_package: 'my.rytbank.app',
    captured_at: '2026-10-02T07:45:58Z', notification_key_hash: 'a'.repeat(64),
    notification: { title: 'Card payment completed 👍', text, subtext: null, posted_at: '2026-10-02T07:45:54Z' },
});
const payment = 'RM200.76 (TWD1,600.00) paid at SYNTHETIC STORE using your Main Account.';
const reviewed = { ...foreign, amount: 200.76, direction: 'expense' as const, merchant: 'SYNTHETIC STORE',
    payee_name: null, transaction_date: '2026-10-02', reference_number: null };
const transaction = { ...reviewed, source_id: source, category_id: null, notes: null, currency: 'MYR' as const };

describe('foreign transaction details', () => {
    it('normalizes decimals and codes without rounding, and requires a valid pair', () => {
        expect(parseForeignDetails({ foreign_amount: '999999999999.1234', foreign_currency: ' twd ' })).toEqual({
            details: { foreign_amount: '999999999999.1234', foreign_currency: 'TWD' },
        });
        for (const foreign_amount of ['0', '-1', '1.23456', '1e3', '1000000000000']) {
            expect(parseForeignDetails({ ...foreign, foreign_amount }).errors?.foreign_amount).toBeDefined();
        }
        for (const foreign_currency of ['MYR', 'ZZZ', null]) {
            expect(parseForeignDetails({ ...foreign, foreign_currency }).errors?.foreign_currency).toBeDefined();
        }
        expect(formatFinanceForeignDetails(200.76, foreign)).toBe('TWD 1,600.00 · 1 TWD = MYR 0.125475');
        expect(formatFinanceForeignDetails(0.01, { ...foreign, foreign_amount: '999999999999' })).not.toContain('MYR 0.00 ');
    });

    it('keeps omission distinct from explicit clearing and detects conflicting replays', () => {
        expect(parseFinanceTransaction({ ...transaction, foreign_amount: null, foreign_currency: null }, '2026-10-02'))
            .toMatchObject({ data: { foreign_amount: null, foreign_currency: null } });
        const { foreign_amount, foreign_currency, ...without } = transaction;
        expect(parseFinanceTransaction(without, '2026-10-02')).not.toHaveProperty('data.foreign_amount');
        expect(parseFinanceTransaction({ ...without, foreign_amount: null }, '2026-10-02'))
            .toHaveProperty('field_errors.foreign_currency');
        const saved: FinanceTransaction = { ...transaction, foreign_amount: '1600.0000', source: 'manual', status: 'confirmed',
            id: source, user_id: user, intake_item_id: null, manual_idempotency_key: null, payee_id: null,
            created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };
        expect(isManualTransactionReplay(saved, { ...without, foreign_amount, foreign_currency })).toBe(true);
        expect(isManualTransactionReplay(saved, { ...transaction, foreign_amount: '1601' })).toBe(false);
        expect(isManualTransactionReplay(saved, without)).toBe(false);
    });

    it('only opens manual fields for selected travel tags, using the latest name', () => {
        const travel = { id: 'tag', name: 'Travel - Taiwan 2026', is_archived: false };
        expect(hasFinanceTravelTag(['tag'], [travel])).toBe(true);
        expect(hasFinanceTravelTag(['tag'], [{ ...travel, name: 'TRAVEL -Taiwan' }])).toBe(true);
        expect(hasFinanceTravelTag([], [travel])).toBe(false);
        expect(hasFinanceTravelTag(['tag'], [{ ...travel, name: 'Travel insurance' }], [travel])).toBe(false);
        expect(hasFinanceTravelTag(['tag'], [{ ...travel, name: 'Travel -' }])).toBe(false);
    });
});

describe('foreign notification extraction and learning', () => {
    it('extracts the Ryt pair and keeps the MYR amount separate', () => {
        const result = parseFinanceNotification(event(payment), notificationPatterns, user);
        expect(result.payload).toMatchObject({ amount: 200.76, currency: 'MYR', merchant: 'SYNTHETIC STORE', ...foreign });
        expect(result.payload?.notification_extraction?.fields.foreign_currency?.pattern_id)
            .toBe(result.payload?.notification_extraction?.fields.foreign_amount?.pattern_id);
        expect(parseFinanceNotification(event('RM40.50 (JPY 4,000) paid at SECOND STORE using your Main Account.'), notificationPatterns, user)
            .payload).toMatchObject({ amount: 40.5, foreign_currency: 'JPY', foreign_amount: '4000' });
    });

    it('does not mistake a domestic merchant name for a foreign amount', () => {
        const result = parseFinanceNotification(event('RM15.00 paid at AUD 23 Cafe using your Main Account.'), notificationPatterns, user);
        expect(result.payload).toMatchObject({ amount: 15, merchant: 'AUD 23 Cafe' });
        expect(result.payload?.notification_extraction?.conflicts).toEqual([]);
    });

    it('blocks automatic use of malformed, ambiguous or out-of-scope pairs', () => {
        for (const text of ['TWD1,60.00', 'TWD-1600', 'TWD0.00', 'TWD12.34567', 'ZZZ1600', 'TWD1600 / USD20']) {
            const result = parseFinanceNotification(event(payment.replace('TWD1,600.00', text)), notificationPatterns, user);
            expect(result.payload?.foreign_amount, text).toBeUndefined();
            expect(result.payload?.notification_extraction?.conflicts, text).toContain('foreign_currency');
        }
        const other = { ...event(payment), source_package: 'my.com.tngdigital.ewallet' as const };
        expect(parseFinanceNotification(other, notificationPatterns, user).payload?.foreign_amount).toBeUndefined();
        const seed = notificationPatterns.find(pattern => pattern.format_key === 'ryt-foreign-card-payment')!;
        const disabled = { ...seed, id: 'owner-override', source_id: source, user_id: user, is_active: false };
        expect(parseFinanceNotification(event(payment), [...notificationPatterns, disabled], user).payload?.foreign_amount)
            .toBeUndefined();
        expect(parseFinanceNotification(event(payment), [...notificationPatterns, disabled], 'another-user').payload)
            .toMatchObject(foreign);
    });

    it('learns a reusable second layout without retaining merchant or money literals', () => {
        const first = event('Settled RM200.76 with SYNTHETIC STORE, card currency TWD1,600.00.');
        const result = learnNotificationPattern(first, reviewed, notificationPatterns, user);
        expect(result).not.toBeNull();
        expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC STORE|200\.76|1,600|TWD/);
        const learned: FinanceNotificationPattern = { ...result!, id: 'learned', user_id: user, source_id: source,
            source_package: first.source_package, is_active: true, evidence_valid: true, revision: 1, origin: 'learned' };
        const next = event('Settled RM67.90 with SECOND SHOP, card currency USD15.25.');
        expect(parseFinanceNotification(next, [learned], user).payload).toMatchObject({
            amount: 67.9, merchant: 'SECOND SHOP', foreign_currency: 'USD', foreign_amount: '15.25',
        });
        expect(parseFinanceNotification(next, [learned], 'other').payload?.foreign_amount).toBeUndefined();
        expect(parseFinanceNotification({ ...next, source_id: 'other-source' }, [learned], user).payload?.foreign_amount).toBeUndefined();
        expect(parseFinanceNotification(next, [{ ...learned, evidence_valid: false }], user).payload?.foreign_amount).toBeUndefined();
        expect(learnNotificationPattern(first, { ...reviewed, foreign_amount: '1500' }, [], user)).toBeNull();
        expect(learnNotificationPattern(event(first.notification.text + ' Balance USD20.00.'), reviewed, [], user)).toBeNull();
        expect(learnNotificationPattern(event(payment), { ...reviewed, merchant: 'Different store' }, notificationPatterns, user)).toBeNull();
    });
});
