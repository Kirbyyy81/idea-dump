import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceReviewDuplicateTransaction } from '@/lib/types';
import { financeLinkOptions } from '@/lib/finance/review';
import { parseFinanceLinkChanges } from '@/lib/finance/core/schemas';

const repo = vi.hoisted(() => ({ findFinanceReviewCandidate: vi.fn(), findFinanceTransaction: vi.fn(), linkFinanceReviewCandidate: vi.fn(), FINANCE_REVIEW_DUPLICATE_SELECT: 'safe-fields' }));
vi.mock('@/lib/finance/core/repository', () => repo);
import { resolveFinanceReviewCandidateForUser } from '@/lib/finance/core/service';

const id = '31000000-0000-4000-8000-000000000031';
const saved: FinanceReviewDuplicateTransaction = {
    id, source_id: '31000000-0000-4000-8000-000000000011', category_id: null,
    direction: 'expense', amount: 4, currency: 'MYR', merchant: 'Original cafe',
    transaction_date: '2026-09-21', reference_number: null, notes: 'Saved note',
    updated_at: '2026-09-21T01:00:00Z', finance_payee: null,
};

describe('Finance duplicate detail choices', () => {
    it('distinguishes gaps from conflicts and omits empty or equivalent incoming values', () => {
        expect(financeLinkOptions(saved, { reference_number: ' ref123 ', merchant: 'Other cafe', notes: '', amount: '4.00' })).toEqual([
            { field: 'reference_number', label: 'Reference number', saved: null, incoming: 'REF123', isGap: true },
            { field: 'merchant', label: 'Merchant', saved: 'Original cafe', incoming: 'Other cafe', isGap: false },
        ]);
    });
    it('does not offer missing or provisional fields as replacements', () => {
        expect(financeLinkOptions(saved, { amount: null, direction: undefined, transaction_date: undefined, source_id: '__new_source__' })).toEqual([]);
    });
    it('accepts only selected valid fields and normalizes a reference', () => {
        expect(parseFinanceLinkChanges({ reference_number: ' ref123 ' }, saved, '2026-09-22')).toEqual({ data: { reference_number: 'REF123' } });
    });
    it('permits explicit conflicts without requiring unrelated missing fields', () => {
        expect(parseFinanceLinkChanges({ amount: 5, merchant: 'Reviewed cafe' }, saved, '2026-09-22')).toEqual({ data: { amount: 5, merchant: 'Reviewed cafe' } });
    });
    it.each([{ amount: 1.001 }, { amount: '5' }, { notes: null }, { notes: 123 }, { user_id: id }, { currency: 'USD' }, { reference_number: 'x'.repeat(201) }, { category_id: 'bad' }, { transaction_date: '2026-02-30' }, { transaction_date: '2026-12-30' }])('rejects invalid selected values: %j', (changes) => {
        expect(parseFinanceLinkChanges(changes, saved, '2026-09-22')).toHaveProperty('error');
    });
    it('can link evidence without selecting any changes', () => {
        expect(parseFinanceLinkChanges({}, saved, '2026-09-22')).toEqual({ data: {} });
    });
});

describe('Finance linked review service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        repo.findFinanceReviewCandidate.mockResolvedValue({ data: { id: 'candidate', status: 'pending', payload: {} } });
        repo.findFinanceTransaction.mockResolvedValue({ data: saved });
        repo.linkFinanceReviewCandidate.mockResolvedValue({ data: { linked: true }, error: null });
    });
    it('scopes candidate and target reads and passes only selected values to the atomic RPC', async () => {
        await resolveFinanceReviewCandidateForUser('owner', 'candidate', 'link_duplicate', { matched_transaction_id: id, expected_updated_at: saved.updated_at, changes: { reference_number: ' ref123 ' }, user_id: 'attacker' }, '2026-09-22');
        expect(repo.findFinanceReviewCandidate).toHaveBeenCalledWith('owner', 'candidate');
        expect(repo.findFinanceTransaction).toHaveBeenCalledWith('owner', id, 'safe-fields');
        expect(repo.linkFinanceReviewCandidate).toHaveBeenCalledWith('owner', 'candidate', id, saved.updated_at, { reference_number: 'REF123' });
    });
    it('does not mutate a missing or inaccessible target', async () => {
        repo.findFinanceTransaction.mockResolvedValue({ data: null });
        await expect(resolveFinanceReviewCandidateForUser('owner', 'candidate', 'link_duplicate', { matched_transaction_id: id, expected_updated_at: saved.updated_at, changes: {} }, '2026-09-22')).rejects.toMatchObject({ status: 404 });
        expect(repo.linkFinanceReviewCandidate).not.toHaveBeenCalled();
    });
    it('reports a stale preview as a conflict rather than silently overwriting', async () => {
        repo.linkFinanceReviewCandidate.mockResolvedValue({ error: { code: '40001', message: 'Changed' } });
        await expect(resolveFinanceReviewCandidateForUser('owner', 'candidate', 'link_duplicate', { matched_transaction_id: id, expected_updated_at: saved.updated_at, changes: { notes: 'New' } }, '2026-09-22')).rejects.toMatchObject({ status: 409 });
    });
});
