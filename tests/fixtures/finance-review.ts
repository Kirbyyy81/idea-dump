import type { FinanceReviewCandidate } from '@/lib/types';

export const reviewCandidates: FinanceReviewCandidate[] = [{
    id: 'candidate-1', confidence: 0.9, duplicate_outcome: 'possible', duplicate_signals: ['amount'], duplicate_explanation: 'Same amount',
    payload: {
        amount: 12.3, currency: 'MYR', merchant: 'Sample cafe', payee_id: null, payee_name: 'Alex', direction: 'expense',
        transaction_date: '2026-09-21', source_id: null, category_id: null, reference_number: null, notes: null,
        matched_rule_names: [], duplicate_transaction_id: 'existing-1',
    },
    duplicate_transaction: { id: 'existing-1', source_id: '31000000-0000-4000-8000-000000000011', category_id: null, direction: 'expense', reference_number: null, notes: null, updated_at: '2026-09-21T00:00:00Z', amount: 12.3, currency: 'MYR', merchant: 'Another cafe', transaction_date: '2026-09-20', finance_source: { name: 'Bank' } },
}, {
    id: 'candidate-2', confidence: null, duplicate_outcome: 'none', duplicate_signals: [], duplicate_explanation: null,
    payload: {
        amount: null, currency: 'MYR', merchant: 'Pending merchant', payee_id: null, payee_name: null, direction: null,
        transaction_date: null, source_id: null, category_id: null, reference_number: null, notes: null,
        matched_rule_names: [], duplicate_transaction_id: null,
    },
}];
