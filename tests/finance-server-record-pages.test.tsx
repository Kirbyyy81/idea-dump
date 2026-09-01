import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceReviewPage from '@/app/finance/review/page';
import FinanceTransactionsPage from '@/app/finance/transactions/page';
import { FinanceReviewClient } from '@/app/finance/review/_components/FinanceReviewClient';
import { FinanceTransactionsClient } from '@/app/finance/transactions/_components/FinanceTransactionsClient';

const {
    pageAccess,
    redirectTo,
    reviewQueueService,
    transactionService,
} = vi.hoisted(() => ({
    pageAccess: vi.fn(),
    redirectTo: vi.fn((href: string) => {
        throw new Error(`redirect:${href}`);
    }),
    reviewQueueService: vi.fn(),
    transactionService: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectTo,
}));
vi.mock('@/lib/finance/core/pageAccess', () => ({
    requireFinancePageAccess: pageAccess,
}));
vi.mock('@/lib/finance/core/service', () => ({
    getFinanceReviewQueueForUser: reviewQueueService,
    getFinanceTransactions: transactionService,
}));

const SOURCE_ID = '00000000-0000-4000-8000-000000000002';
const CATEGORY_ID = '00000000-0000-4000-8000-000000000001';
const CANDIDATE_ONE = '00000000-0000-4000-8000-000000000003';
const CANDIDATE_TWO = '00000000-0000-4000-8000-000000000004';

describe('server-rendered Finance record pages', () => {
    beforeEach(() => {
        pageAccess.mockReset();
        redirectTo.mockClear();
        reviewQueueService.mockReset();
        transactionService.mockReset();
        pageAccess.mockResolvedValue({ user: { id: 'user-1' } });
        transactionService.mockResolvedValue([{ id: 'transaction-1' }]);
        reviewQueueService.mockResolvedValue({
            data: [{ id: CANDIDATE_ONE }, { id: CANDIDATE_TWO }],
            failed_intakes: [{ id: 'failed-1' }],
        });
    });

    it('authorizes and loads a filtered tenant ledger on the server', async () => {
        const page = await FinanceTransactionsPage({
            searchParams: Promise.resolve({
                category_id: CATEGORY_ID,
                date: '2026-08-13',
                source_id: SOURCE_ID,
                q: 'Lunch',
            }),
        });

        expect(pageAccess).toHaveBeenCalledOnce();
        expect(transactionService).toHaveBeenCalledWith('user-1', {
            categoryId: CATEGORY_ID,
            date: '2026-08-13',
            dateFrom: null,
            dateTo: null,
            direction: null,
            query: 'Lunch',
            sourceId: SOURCE_ID,
            status: 'confirmed',
            uncategorised: false,
        });
        expect(page.type).toBe(FinanceTransactionsClient);
        expect(page.props.initialTransactions).toEqual([{ id: 'transaction-1' }]);
        expect(page.props.initialQuery).toBe('Lunch');
    });

    it('redirects invalid ledger filters before querying transaction data', async () => {
        await expect(FinanceTransactionsPage({
            searchParams: Promise.resolve({ category_id: 'not-an-id' }),
        })).rejects.toThrow('redirect:/finance/transactions');

        expect(pageAccess).toHaveBeenCalledOnce();
        expect(transactionService).not.toHaveBeenCalled();
    });

    it('loads the review queue on the server and selects a requested candidate', async () => {
        const page = await FinanceReviewPage({
            searchParams: Promise.resolve({ candidate: CANDIDATE_TWO }),
        });

        expect(pageAccess).toHaveBeenCalledOnce();
        expect(reviewQueueService).toHaveBeenCalledWith('user-1');
        expect(page.type).toBe(FinanceReviewClient);
        expect(page.props.initialCandidates).toEqual([
            { id: CANDIDATE_ONE },
            { id: CANDIDATE_TWO },
        ]);
        expect(page.props.initialFailedIntakes).toEqual([{ id: 'failed-1' }]);
        expect(page.props.initialSelectedId).toBe(CANDIDATE_TWO);
        expect(page.props.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('falls back to the first review item when the requested candidate is unavailable', async () => {
        const page = await FinanceReviewPage({
            searchParams: Promise.resolve({ candidate: 'missing' }),
        });

        expect(page.props.initialSelectedId).toBe(CANDIDATE_ONE);
    });

    it('keeps only record mutations in browser API routes', () => {
        const root = path.resolve(import.meta.dirname, '..');
        const transactionsPage = fs.readFileSync(
            path.join(root, 'app', 'finance', 'transactions', 'page.tsx'),
            'utf8'
        );
        const reviewPage = fs.readFileSync(
            path.join(root, 'app', 'finance', 'review', 'page.tsx'),
            'utf8'
        );
        const transactionsClient = fs.readFileSync(
            path.join(root, 'app', 'finance', 'transactions', '_components', 'FinanceTransactionsClient.tsx'),
            'utf8'
        );
        const reviewClient = fs.readFileSync(
            path.join(root, 'app', 'finance', 'review', '_components', 'FinanceReviewClient.tsx'),
            'utf8'
        );
        const transactionsApi = fs.readFileSync(
            path.join(root, 'app', 'api', 'finance', 'transactions', 'route.ts'),
            'utf8'
        );
        const reviewApi = fs.readFileSync(
            path.join(root, 'app', 'api', 'finance', 'review', 'route.ts'),
            'utf8'
        );

        expect(transactionsPage).not.toMatch(/^['"]use client['"]/);
        expect(reviewPage).not.toMatch(/^['"]use client['"]/);
        expect(transactionsClient).not.toContain("financeApiRequest<{ data: FinanceTransactionView[] }>");
        expect(reviewClient).not.toContain("financeApiRequest<{ data: FinanceReviewCandidate[]");
        expect(transactionsApi).not.toContain('export async function GET');
        expect(reviewApi).not.toContain('export async function GET');
        expect(transactionsApi).toContain('export async function POST');
        expect(transactionsApi).toContain('export async function PUT');
        expect(transactionsApi).toContain('export async function DELETE');
        expect(reviewApi).toContain('export async function POST');
    });
});
