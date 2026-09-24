import { describe, expect, it } from 'vitest';
import type { FinanceNotificationEventInput } from '@/lib/types';
import { parseFinanceNotificationRequest } from '@/lib/finance/notifications/schemas';
import { parseFinanceNotification } from '@/lib/finance/notifications/parser';
import { notificationPayloadDigest } from '@/lib/finance/notifications/replay';

const fixture = (text = 'Alex Tan has transferred RM 25.90 to you. Tap here to check the transaction details'): FinanceNotificationEventInput => ({
    client_event_id: '00000000-0000-4000-8000-000000000001',
    source_id: '00000000-0000-4000-8000-000000000002',
    source_package: 'my.com.tngdigital.ewallet',
    notification_key_hash: 'a'.repeat(64),
    captured_at: '2026-09-25T16:01:00.000Z',
    notification: { title: 'TNG eWallet', text, subtext: null, posted_at: '2026-09-25T16:00:00.000Z' },
});
describe('Finance notification intake', () => {
    it('parses TNG income and suggests the Malaysia notification date', () => {
        const result = parseFinanceNotification(fixture());
        expect(result.status).toBe('review');
        expect(result.payload).toMatchObject({ amount: 25.9, direction: 'income', payee_name: 'Alex Tan', transaction_date: '2026-09-26', notes: null });
        expect(result.date_provenance).toBe('posted_at');
    });
    it('parses Ryt expense with explicit transaction date', () => {
        const event = fixture("You've sent RM 1,025.90 to Mei Ling on 25 Sep 2026, 1:25pm (GMT+8) using your main account");
        event.source_package = 'my.rytbank.app';
        const result = parseFinanceNotification(event);
        expect(result.payload).toMatchObject({ amount: 1025.9, direction: 'expense', payee_name: 'Mei Ling', transaction_date: '2026-09-25' });
        expect(result.date_provenance).toBe('notification_text');
    });
    it('does not replace an invalid explicit date with the posted date', () => {
        const event = fixture("You've sent RM 10.00 to Alex on 31/02/2026, 1:25pm (GMT+8) using your main account");
        event.source_package = 'my.rytbank.app';
        expect(parseFinanceNotification(event)).toMatchObject({ date_provenance: 'unavailable', payload: { transaction_date: null } });
    });
    it.each([
        'Your OTP is 123456 for payment RM 25.90',
        'Your TAC for a payment RM 25.90 is 123456',
        'Payment RM 25.90 declined',
        'Special offer: payment cashback RM 25.90',
        'Your available balance is RM 200.00',
        'Sensitive content hidden',
    ])('discards sensitive or nontransaction text: %s', text => {
        expect(parseFinanceNotification(fixture(text)).status).toBe('ignored');
    });
    it('leaves an ambiguous payment amount unset instead of selecting a balance', () => {
        expect(parseFinanceNotification(fixture('Payment received. Available balance RM 500.00')).payload?.amount).toBeNull();
    });
    it('preserves Unicode names', () => {
        expect(parseFinanceNotification(fixture('小明 has transferred RM 10.00 to you.')).payload?.payee_name).toBe('小明');
    });
    it('keeps unsupported transaction wording reviewable without guessing direction', () => {
        expect(parseFinanceNotification(fixture('Payment received RM 10.00')).payload).toMatchObject({ amount: 10, direction: null });
    });
    it('bounds fields and rejects unrelated apps and UOB until validated', () => {
        expect(parseFinanceNotificationRequest(fixture())).toHaveProperty('data');
        expect(parseFinanceNotificationRequest({ ...fixture(), source_package: 'com.uob.mightymy' })).toHaveProperty('error');
        expect(parseFinanceNotificationRequest({ ...fixture(), source_package: 'com.example.chat' })).toHaveProperty('error');
        expect(parseFinanceNotificationRequest(fixture('x'.repeat(8193)))).toHaveProperty('error');
        expect(parseFinanceNotificationRequest({ ...fixture(), captured_at: '2026-09-25' })).toHaveProperty('error');
    });
    it('normalizes timestamp representations before computing the replay digest', () => {
        const a = fixture();
        const b = { ...a, captured_at: '2026-09-26T00:01:00+08:00' };
        const first = parseFinanceNotificationRequest(a), second = parseFinanceNotificationRequest(b);
        if (!('data' in first) || !('data' in second)) throw new Error('Invalid fixture');
        expect(notificationPayloadDigest(first.data)).toBe(notificationPayloadDigest(second.data));
        expect(notificationPayloadDigest({ ...first.data, source_id: '00000000-0000-4000-8000-000000000003' })).not.toBe(notificationPayloadDigest(first.data));
    });
});
