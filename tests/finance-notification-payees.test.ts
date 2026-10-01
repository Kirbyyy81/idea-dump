import { describe, expect, it } from 'vitest';
import type { FinanceCandidatePayload, FinanceOcrPayee } from '@/lib/types';
import { matchFinanceNotificationPayee } from '@/lib/finance/notifications/payees';
import { normalizeFinancePayeeKey } from '@/lib/finance/ocr/normalizer';

const candidate = (name: string | null): FinanceCandidatePayload => ({
    amount: 10, currency: 'MYR', merchant: null, payee_id: null, payee_name: name,
    direction: 'expense', transaction_date: '2026-09-26', source_id: 'tng', category_id: null,
    reference_number: null, notes: null, matched_rule_names: [], duplicate_transaction_id: null,
});
const saved = (name = 'Alex Tan', overrides: Partial<FinanceOcrPayee> = {}): FinanceOcrPayee => ({
    id: 'payee-1', name, normalized_name: normalizeFinancePayeeKey(name), is_archived: false, ...overrides,
});

describe('notification saved payees', () => {
    it.each(['ALEX TAN', 'alex-tan', 'Ａｌｅｘ Ｔａｎ'])('matches a unique active normalized name: %s', name => {
        const payload = candidate(name);
        expect(matchFinanceNotificationPayee(payload, [saved()])).toMatchObject({ payee_id: 'payee-1', payee_name: 'Alex Tan', amount: 10, direction: 'expense' });
        expect(payload.payee_id).toBeNull();
        expect(payload.payee_name).toBe(name);
    });
    it('uses the existing convention for Unicode letters and punctuation', () => {
        const name = "Jean D'Ávila A/P Tan @ Alex";
        expect(matchFinanceNotificationPayee(candidate('JEAN D’ÁVILA A/P TAN @ ALEX'), [saved(name)]).payee_name).toBe(name);
    });
    it('falls back to the saved name when its normalized key is missing', () => {
        expect(matchFinanceNotificationPayee(candidate('Alex Tan'), [saved('ALEX TAN', { normalized_name: '' })])).toMatchObject({ payee_id: 'payee-1', payee_name: 'ALEX TAN' });
    });
    it.each([
        [],
        [saved('Mei Ling')],
        [saved('Alex Tan', { is_archived: true })],
        [saved(), saved('ALEX-TAN', { id: 'payee-2' })],
    ].map(payees => ({ payees })))('retains the extracted name for missing, archived or ambiguous matches', ({ payees }) => {
        expect(matchFinanceNotificationPayee(candidate('alex tan'), payees)).toMatchObject({ payee_id: null, payee_name: 'alex tan' });
    });
    it('does not let an archived collision block a unique active match', () => {
        expect(matchFinanceNotificationPayee(candidate('Alex Tan'), [saved(), saved('ALEX-TAN', { id: 'archived', is_archived: true })]).payee_id).toBe('payee-1');
    });
    it.each([null, '', '小明', '@ /'])('does not match empty normalized keys: %s', name => {
        expect(matchFinanceNotificationPayee(candidate(name), [saved('小明', { normalized_name: '' })])).toMatchObject({ payee_id: null, payee_name: name });
    });
});
