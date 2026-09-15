import { describe, expect, it, vi } from 'vitest';
const repo = vi.hoisted(() => ({
    findFinanceReviewCandidate: vi.fn(), updateFinanceReviewCandidate: vi.fn(), updateFinanceIntakeSourceEvidence: vi.fn().mockResolvedValue({ error: null }),
    listActiveFinanceSources: vi.fn(), listRuntimeFinanceSourceTemplates: vi.fn().mockResolvedValue({ data: [] }),
    listRuntimeFinanceFieldTemplates: vi.fn().mockResolvedValue({ data: [] }), listActiveFinanceRules: vi.fn().mockResolvedValue({ data: [] }),
    listActiveFinanceFieldLearningRules: vi.fn().mockResolvedValue({ data: [] }), listActiveFinancePayees: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('@/lib/finance/core/repository', () => repo);
vi.mock('@/lib/finance/transactions/duplicates', () => ({
    assessFinanceDuplicate: vi.fn().mockResolvedValue({ outcome: 'none', matchedTransactionId: null, score: 0, signals: [], explanation: '' }),
    financeDuplicateColumns: vi.fn().mockReturnValue({ duplicate_outcome: 'none' }),
}));
import { resolveFinanceReviewCandidateForUser } from '@/lib/finance/core/service';

describe('review retry preserves receipt classification', () => {
    it.each([true, false])('reparses with the original classified evidence: %s', async (classified) => {
        const processing = classified ? { format: 'ryt_shared_v1', detector_version: 1, failed_regions: [], conflicts: ['amount'] } : undefined;
        repo.findFinanceReviewCandidate.mockResolvedValue({ data: {
            id: 'candidate', intake_item_id: 'intake', status: 'pending', payload: {},
            intake: { original_filename: 'receipt.png', ocr_normalized_text: 'Ryt Bank\nRM 17.25\n9 Sep 2026\nRecipient\nSYNTHETIC CORNER SHOP', receipt_processing: processing },
        } });
        repo.listActiveFinanceSources.mockResolvedValue({ data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Ryt Bank', filename_aliases: [], ocr_aliases: [], is_archived: false }] });
        repo.updateFinanceReviewCandidate.mockImplementation(async (_user, _candidate, update) => ({ data: { id: 'candidate', ...update } }));
        const result = await resolveFinanceReviewCandidateForUser('user', 'candidate', 'retry', {}, '2026-09-09');
        expect(result.kind).toBe('candidate');
        const payload = repo.updateFinanceReviewCandidate.mock.calls.at(-1)![2].payload;
        expect(payload.amount).toBe(classified ? null : 17.25);
        expect(payload.receipt_processing).toEqual(processing);
        expect(payload.payee_name).toBe('SYNTHETIC CORNER SHOP');
    });
});
