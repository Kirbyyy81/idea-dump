import { describe, expect, it } from 'vitest';
import { applyNotificationRules } from '@/lib/finance/notifications/rules';
import type { FinanceCandidatePayload, FinanceOcrRule } from '@/lib/types';

const payload: FinanceCandidatePayload = {
    amount: 12.3, currency: 'MYR', merchant: null, payee_id: null, payee_name: 'Alex',
    direction: 'income', transaction_date: '2026-09-25', source_id: 'tng', category_id: null,
    reference_number: null, notes: null, matched_rule_names: [], duplicate_transaction_id: null,
};
const rule = (overrides: Partial<FinanceOcrRule> = {}): FinanceOcrRule => ({
    id: 'rule-1', name: 'Transfers', pattern: 'transferred', match_type: 'keyword', source: 'manual',
    source_id: 'tng', category_id: 'income', direction: null, priority: 10, is_active: true,
    created_at: '2026-09-25', ...overrides,
});
describe('notification rules', () => {
    it('applies manual rules while preserving the explicit source and parser fields', () => {
        const result = applyNotificationRules(payload,'Alex has transferred RM 12.30 to you',[rule()]);
        expect(result.payload).toMatchObject({ source_id: 'tng', category_id: 'income', amount: 12.3, payee_name: 'Alex', notes: null });
        expect(result.payload.matched_rule_names).toEqual(['Transfers']);
        expect(result.matched_rule_id).toBe('rule-1');
        expect(payload.category_id).toBeNull();
    });
    it('excludes learned, inactive and other-source rules', () => {
        const rules = [rule({ source: 'learning' }), rule({ is_active: false }), rule({ source_id: 'ryt' })];
        expect(applyNotificationRules(payload,'transferred',rules).payload.category_id).toBeNull();
    });
    it('uses deterministic rule priority without applying screenshot templates', () => {
        const result = applyNotificationRules(payload,'transferred',[
            rule({ id: 'later', priority: 20, category_id: 'later' }), rule({ id: 'first', priority: 1, category_id: 'first' }),
        ]);
        expect(result.payload.category_id).toBe('first');
        expect(result.payload.parser_template_evaluations).toBeUndefined();
    });
});
