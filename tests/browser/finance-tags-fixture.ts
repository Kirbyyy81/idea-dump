import type { FinanceTransactionView } from '@/lib/types';
export const tripTag = { id: '10000000-0000-4000-8000-000000000001', name: 'Holiday', is_archived: false };
export const archivedTag = { id: '10000000-0000-4000-8000-000000000002', name: 'Hackathon', is_archived: true };
export const tagTransactions: FinanceTransactionView[] = [
    { id: '30000000-0000-4000-8000-000000000001', source_id: '20000000-0000-4000-8000-000000000001', category_id: null, direction: 'expense', amount: 70, currency: 'MYR', merchant: 'Trip cafe', payee_id: null, reference_number: null, transaction_date: '2026-09-21', notes: null, created_at: '2026-09-21T00:00:00Z', tags: [tripTag] },
    { id: '30000000-0000-4000-8000-000000000002', source_id: '20000000-0000-4000-8000-000000000001', category_id: null, direction: 'expense', amount: 12, currency: 'MYR', merchant: 'Daily cafe', payee_id: null, reference_number: null, transaction_date: '2026-09-21', notes: null, created_at: '2026-09-21T00:00:00Z', tags: [] },
];
