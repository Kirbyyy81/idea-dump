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

describe('notification date validation', () => {
    it('does not normalize impossible capture timestamps into another day', () => {
        expect(parseFinanceNotificationRequest({ ...fixture(), captured_at: '2026-02-30T01:00:00Z' })).toHaveProperty('error');
    });
    it('prefers explicit dates even in partial transaction wording', () => {
        expect(parseFinanceNotification(fixture('Payment of RM 12.30 on 24/09/2026'))).toMatchObject({ date_provenance: 'notification_text', payload: { transaction_date: '2026-09-24' } });
    });
    it('keeps malformed or conflicting explicit dates unset', () => {
        for (const text of ['Payment of RM 12.30 on 31/02/2026', 'Payment of RM 12.30 on 24/09/2026 posted 25/09/2026']) {
            expect(parseFinanceNotification(fixture(text))).toMatchObject({ date_provenance: 'unavailable', payload: { transaction_date: null } });
        }
    });
});


describe('notification text normalization', () => {
    it.each([
        ['RM 25.90 has been successfully transferred to Alex Tan.', 'expense', 'Alex Tan', 25.9],
        ['RM 1,025.90 received from Mei Ling for Fund Transfer.', 'income', 'Mei Ling', 1025.9],
        ['RM 25.90 has been successfully transferred to Alex Tan', 'expense', 'Alex Tan', 25.9],
        ['RM 25.90 received from Mei Ling for Fund Transfer', 'income', 'Mei Ling', 25.9],
    ])('parses observed TNG wording: %s', (text, direction, payeeName, amount) => {
        expect(parseFinanceNotification(fixture(text))).toMatchObject({
            status: 'review', date_provenance: 'posted_at',
            payload: { amount, direction, payee_name: payeeName, transaction_date: '2026-09-26' },
        });
    });
    it.each([
        '  RM\u00a025.90\n has been  successfully\ttransferred to\nAlex\u00a0Tan.  ',
        'ＲＭ ２５.９０ has been successfully transferred to Ａｌｅｘ Ｔａｎ．',
    ])('normalizes whitespace and full-width characters: %s', text => {
        expect(parseFinanceNotification(fixture(text)).payload).toMatchObject({ amount: 25.9, direction: 'expense', payee_name: 'Alex Tan' });
    });
    it('normalizes Ryt apostrophes, whitespace and explicit dates', () => {
        const event = fixture('You’ve\n sent RM\u00a010.00 to Jean D’Ávila on ２５ Sep ２０２６,\n 1:25pm (GMT+8) using your main account');
        event.source_package = 'my.rytbank.app';
        expect(parseFinanceNotification(event)).toMatchObject({
            date_provenance: 'notification_text', payload: { amount: 10, direction: 'expense', payee_name: "Jean D'Ávila", transaction_date: '2026-09-25' },
        });
    });
    it.each([
        ['RM 10.00 has been successfully transferred to 小明.', '小明'],
        ['RM 10.00 received from Nur A/P Rani @ Devi for Fund Transfer.', 'Nur A/P Rani @ Devi'],
        ['RM 10.00 has been successfully transferred to Jean D’Ávila-Smith, Jr. (A).', "Jean D'Ávila-Smith, Jr. (A)"],
        ['RM 10.00 received from A. Tan & Co. for Fund Transfer.', 'A. Tan & Co.'],
        ['O’Neil A/P Tan @ Alex has transferred RM 10.00 to you.', "O'Neil A/P Tan @ Alex"],
    ])('preserves legitimate name characters within template boundaries: %s', (text, name) => {
        expect(parseFinanceNotification(fixture(text)).payload?.payee_name).toBe(name);
    });
    it.each([
        'Paid RM 10.00 and sent RM 20.00',
        'RM 10.00 has been successfully transferred to Alex. RM 20.00 received from Mei for Fund Transfer.',
        'Alex has transferred RM 10.00 to you. Mei has transferred RM 20.00 to you.',
        'Paid RM 10.00. Available balance RM 500.00',
    ])('leaves ambiguous monetary values and direction unset: %s', text => {
        expect(parseFinanceNotification(fixture(text)).payload).toMatchObject({ amount: null, direction: null, payee_name: null });
    });
    it('does not apply a TNG-specific direction to another source', () => {
        const event = fixture('RM 10.00 received from Alex for Fund Transfer.');
        event.source_package = 'my.rytbank.app';
        expect(parseFinanceNotification(event).payload).toMatchObject({ amount: null, direction: null, payee_name: null });
    });
    it.each([
        ['Your ＯＴＰ is 123456 for payment ＲＭ １０.００', 'sensitive_notification'],
        ['Special\u00a0offer: payment cashback RM 10.00', 'not_transaction'],
        ['Your available balance is ＲＭ ５００.００', 'not_transaction'],
    ])('checks normalized sensitive and irrelevant text: %s', (text, failureCode) => {
        expect(parseFinanceNotification(fixture(text))).toMatchObject({ status: 'ignored', payload: null, failure_code: failureCode });
    });
    it('keeps invalid explicit full-width dates unset', () => {
        expect(parseFinanceNotification(fixture('Payment of ＲＭ １２.３０ on ３１/０２/２０２６'))).toMatchObject({
            date_provenance: 'unavailable', payload: { amount: 12.3, direction: null, transaction_date: null },
        });
    });
    it('leaves raw text and replay identity unchanged', () => {
        const event = fixture('ＲＭ\u00a0１０.００ has been successfully transferred to Jean D’Ávila.');
        event.notification.title = 'ＴＮＧ\n eWallet';
        event.notification.subtext = '  Transfer\u00a0completed  ';
        const raw = structuredClone(event);
        const digest = notificationPayloadDigest(event);
        expect(parseFinanceNotification(event).payload).toMatchObject({ amount: 10, direction: 'expense', payee_name: "Jean D'Ávila" });
        expect(event).toEqual(raw);
        expect(notificationPayloadDigest(event)).toBe(digest);
        expect(notificationPayloadDigest({ ...event, notification: { ...event.notification, text: "RM 10.00 has been successfully transferred to Jean D'Ávila." } })).not.toBe(digest);
    });
});


describe('Ryt merchant payments', () => {
    const payment = (text = "You've paid RM12.30 to SYNTHETIC CAFE on 1/10/2026, 3:51 PM (GMT+8) using your Main Account.") => ({
        ...fixture(text), source_package: 'my.rytbank.app' as const,
        notification: { ...fixture(text).notification, title: 'Nice! Payment successful!' },
    });
    it('extracts the observed paid template as a merchant expense', () => {
        expect(parseFinanceNotification(payment())).toMatchObject({
            status: 'review', date_provenance: 'notification_text',
            payload: { amount: 12.3, merchant: 'SYNTHETIC CAFE', direction: 'expense', payee_id: null, payee_name: null, transaction_date: '2026-10-01' },
        });
    });
    it('normalizes payment text while retaining Unicode and internal merchant punctuation', () => {
        const text = 'You’ve paid ＲＭ\u00a0１２.３０ to Café D’Ávila & Co. (MY)\n on １/１０/２０２６, 3:51 PM (GMT+8) using your Main Account.';
        const input = payment(text);
        const raw = structuredClone(input);
        const digest = notificationPayloadDigest(input);
        expect(parseFinanceNotification(input).payload).toMatchObject({ amount: 12.3, merchant: "Café D'Ávila & Co. (MY)", direction: 'expense', payee_name: null, transaction_date: '2026-10-01' });
        expect(input).toEqual(raw);
        expect(notificationPayloadDigest(input)).toBe(digest);
    });
    it('keeps sent transfers as payees even when a recipient name resembles a business', () => {
        expect(parseFinanceNotification(payment("You've sent RM12.30 to SYNTHETIC CAFE on 1/10/2026, 3:51 PM (GMT+8) using your Main Account.")).payload).toMatchObject({
            amount: 12.3, merchant: null, direction: 'expense', payee_id: null, payee_name: 'SYNTHETIC CAFE',
        });
    });
    it('keeps malformed payment dates unset', () => {
        expect(parseFinanceNotification(payment("You've paid RM12.30 to SYNTHETIC CAFE on 31/02/2026, 3:51 PM (GMT+8) using your Main Account."))).toMatchObject({
            date_provenance: 'unavailable', payload: { amount: 12.3, merchant: 'SYNTHETIC CAFE', direction: 'expense', transaction_date: null },
        });
    });
    it('does not guess a merchant or direction from unsupported payment wording', () => {
        expect(parseFinanceNotification(payment('You paid RM12.30 to SYNTHETIC CAFE')).payload).toMatchObject({ amount: 12.3, merchant: null, direction: null, payee_name: null });
    });
    it('does not apply the Ryt merchant template to TNG', () => {
        const input = { ...payment(), source_package: 'my.com.tngdigital.ewallet' as const };
        expect(parseFinanceNotification(input).payload).toMatchObject({ amount: 12.3, merchant: null, direction: null, payee_name: null });
    });
    it('accepts a sentence period after a fallback amount', () => {
        expect(parseFinanceNotification(payment('Paid RM12.30.')).payload).toMatchObject({ amount: 12.3, merchant: null, direction: null });
    });
    it.each(['Paid RM12.300', 'Paid RM12.30.99'])('does not reinterpret malformed monetary values: %s', text => {
        expect(parseFinanceNotification(payment(text))).toMatchObject({ status: 'ignored', payload: null });
    });
    it('keeps multiple monetary values conservative', () => {
        expect(parseFinanceNotification(payment(payment().notification.text + ' Available balance RM500.00.')).payload).toMatchObject({ amount: null, merchant: null, direction: null, payee_name: null });
    });
    it.each(['OTP for payment', 'Payment declined', 'Special offer'])('rejects unsafe or irrelevant payment notifications: %s', title => {
        const input = payment();
        input.notification.title = title;
        expect(parseFinanceNotification(input).status).toBe('ignored');
    });
});
