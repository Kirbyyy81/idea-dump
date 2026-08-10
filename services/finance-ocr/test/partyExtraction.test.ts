import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import type { FinancePayee } from '@/lib/types';

const alice: FinancePayee = {
    id: 'payee-alice',
    user_id: 'user-1',
    name: 'Alice Tan',
    normalized_name: 'alicetan',
    is_archived: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
};

function parse(text: string, payees: FinancePayee[] = []) {
    return parseFinanceText(text, [], [], 'Screenshot.png', [], payees).payload;
}

describe('Finance merchant and payee extraction', () => {
    it('extracts an explicitly labelled merchant without a payee', () => {
        const payload = parse('Merchant: Coffee House\nAmount RM 12.50');
        expect(payload.merchant).toBe('Coffee House');
        expect(payload.payee_name).toBeNull();
    });

    it.each(['Payee: Alice Tan', 'Recipient: Alice Tan', 'Transfer to: Alice Tan', 'Transfer Recipient: Alice Tan'])(
        'extracts an explicitly labelled payee from %s',
        (label) => {
            const payload = parse(`${label}\nAmount RM 12.50`, [alice]);
            expect(payload.merchant).toBeNull();
            expect(payload.payee_id).toBe(alice.id);
            expect(payload.payee_name).toBe(alice.name);
        },
    );

    it('keeps both explicitly labelled merchant and payee values', () => {
        const payload = parse('Merchant: Coffee House\nRecipient: Alice Tan\nAmount RM 12.50', [alice]);
        expect(payload.merchant).toBe('Coffee House');
        expect(payload.payee_name).toBe('Alice Tan');
    });

    it('classifies an unlabelled exact normalized saved-payee match as a payee', () => {
        const payload = parse('Ryt Bank\nAlice-Tan\nPaid RM 12.50', [alice]);
        expect(payload.merchant).toBeNull();
        expect(payload.payee_id).toBe(alice.id);
        expect(payload.payee_name).toBe(alice.name);
    });

    it('lets an explicit merchant label override a saved-payee catalog match', () => {
        const payload = parse('Merchant: Alice Tan\nPaid RM 12.50', [alice]);
        expect(payload.merchant).toBe('Alice Tan');
        expect(payload.payee_id).toBeNull();
        expect(payload.payee_name).toBeNull();
    });

    it('ignores archived payees during unlabelled classification', () => {
        const payload = parse('Alice Tan\nPaid RM 12.50', [{ ...alice, is_archived: true }]);
        expect(payload.merchant).toBe('Alice Tan');
        expect(payload.payee_name).toBeNull();
    });
});
