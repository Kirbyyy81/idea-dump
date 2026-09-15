import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import type { FinanceOcrRule } from '@/lib/types';
import { auroraSource } from './fixtures/parserBaseline';

const rule: FinanceOcrRule = {
    id: 'retired', name: 'Legacy shop', source: 'learning', auto_created_at: null,
    match_type: 'keyword', pattern: 'synthetic shop', category_id: 'legacy-category',
    source_id: auroraSource.id, direction: 'income', priority: 1, is_active: true,
    created_at: '2026-01-01T00:00:00Z',
};
const text = 'Synthetic Shop\nRM 12.50\nReference: TXN-123456\n15/07/2026';
describe('retired legacy learning', () => {
    it.each([null, '2026-01-01T00:00:00Z'])('ignores even active learned rules with auto-created date %s', (auto_created_at) => {
        const parsed = parseFinanceText(text, [{ ...rule, auto_created_at }], [auroraSource], 'Aurora Wallet.png');
        expect(parsed.payload).toMatchObject({ category_id: null, direction: null, reference_number: 'TXN-123456', learned_field_rule_ids: [], matched_rule_names: [] });
        expect(parsed.matchedRuleId).toBeNull();
        expect(parsed.payload.parser_template_baseline?.reference_number).toBe('TXN-123456');
    });
    it('continues applying manual rules before recording the baseline', () => {
        const parsed = parseFinanceText(text, [{ ...rule, source: 'manual' }], [auroraSource], 'Aurora Wallet.png');
        expect(parsed.payload.category_id).toBe('legacy-category');
        expect(parsed.payload.direction).toBe('income');
        expect(parsed.payload.parser_template_baseline?.direction).toBe('income');
        expect(parsed.matchedRuleId).toBe('retired');
    });
});
