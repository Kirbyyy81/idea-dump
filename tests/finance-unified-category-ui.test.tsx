import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesSettingsPanel } from '@/app/finance/settings/_components/CategoriesSettingsPanel';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import { financeApiRequest } from '@/lib/finance/core/client';
import { FinanceCategoryDetail } from '@/lib/types';

vi.mock('@/lib/finance/core/client', () => ({
    financeApiRequest: vi.fn(),
}));
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({
    useFinanceReferenceData: () => ({
        upsertCategory: vi.fn(),
        removeCategory: vi.fn(),
    }),
}));

const categories: FinanceCategoryDetail[] = [
    {
        id: '20000000-0000-4000-8000-000000000002',
        name: 'Legacy',
        is_archived: true,
    },
    ...['Food', 'Drinks', 'Transport', 'Gifts', 'Salary'].map((name, index) => ({
        id: `20000000-0000-4000-8000-00000000000${index + 3}`,
        name,
        is_archived: false,
    })),
];

describe('unified Finance category settings', () => {
    beforeEach(() => {
        vi.mocked(financeApiRequest).mockResolvedValue({ data: categories });
    });

    it('renders one name-only category library with active categories first', async () => {
        render(
            <AlertProvider>
                <CategoriesSettingsPanel />
            </AlertProvider>
        );

        expect(await screen.findByRole('heading', { name: 'Categories' })).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'Expense categories' })).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Income categories' })).toBeNull();
        expect(screen.queryByLabelText('Category type')).toBeNull();
        expect(screen.queryByLabelText('Category colour label')).toBeNull();
        expect(screen.queryByLabelText('Category icon label')).toBeNull();

        const salary = screen.getByText('Salary');
        const legacy = screen.getByText('Legacy');
        expect(salary.compareDocumentPosition(legacy) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
    });

    it('preserves category selections when direction changes', () => {
        const root = path.resolve(import.meta.dirname, '..');
        const addSource = fs.readFileSync(path.join(
            root,
            'app',
            'finance',
            'add',
            '_components',
            'FinanceTransactionEntry.tsx'
        ), 'utf8');
        const reviewSource = fs.readFileSync(path.join(root, 'app', 'finance', 'review', 'page.tsx'), 'utf8');
        const transactionSource = fs.readFileSync(path.join(root, 'app', 'finance', 'transactions', 'page.tsx'), 'utf8');
        const ruleSource = fs.readFileSync(path.join(
            root,
            'app',
            'finance',
            'settings',
            '_components',
            'RulesSettingsPanel.tsx'
        ), 'utf8');

        expect(addSource).not.toMatch(/setManualField\('category_id',\s*''\)/);
        expect(reviewSource).not.toMatch(/setReviewField\('category_id',\s*''\)/);
        expect(transactionSource).not.toMatch(/setTransactionField\('category_id',\s*''\)/);
        expect(ruleSource).not.toMatch(/direction as FinanceTransactionDirection,\s*category_id: ''/);
    });
});
