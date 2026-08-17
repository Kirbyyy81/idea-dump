import { describe, expect, it } from 'vitest';
import {
    getFinanceCategoryOptions,
    getMissingDefaultCategories,
    getVirtualDefaultCategoryName,
    mergeFinanceCategory,
    sortFinanceCategories,
} from '@/lib/finance/catalog';
import { FinanceCategory } from '@/lib/types';

function category(
    id: string,
    name: string,
    isArchived = false
): FinanceCategory {
    return {
        id,
        user_id: '10000000-0000-4000-8000-000000000001',
        name,
        is_archived: isArchived,
        created_at: '2026-08-17T00:00:00.000Z',
        updated_at: '2026-08-17T00:00:00.000Z',
    };
}

describe('unified Finance category catalog', () => {
    it('provides one alphabetic list of active categories and missing defaults', () => {
        const categories = [
            category('2', 'Salary'),
            category('1', 'food'),
            category('3', 'Legacy', true),
        ];

        const options = getFinanceCategoryOptions(categories);

        expect(options.map((option) => option.label)).toEqual([
            'Drinks',
            'food',
            'Gifts',
            'Salary',
            'Transport',
        ]);
        expect(getMissingDefaultCategories(categories)).toEqual([
            'Drinks',
            'Transport',
            'Gifts',
        ]);
    });

    it('includes only the currently selected archived category while editing', () => {
        const categories = [
            category('1', 'Active'),
            category('2', 'Current archived', true),
            category('3', 'Other archived', true),
        ];

        expect(getFinanceCategoryOptions(categories).map((option) => option.value))
            .not.toContain('2');
        expect(getFinanceCategoryOptions(categories, { currentCategoryId: '2' }))
            .toContainEqual({
                value: '2',
                label: 'Current archived (archived)',
                isVirtualDefault: false,
                disabled: true,
            });
        expect(getFinanceCategoryOptions(categories, { currentCategoryId: '2' })
            .map((option) => option.value)).not.toContain('3');
    });

    it('deduplicates by normalized name and orders active categories before archived ones', () => {
        const merged = mergeFinanceCategory(
            [
                category('old', ' Shopping '),
                category('archived', 'Archive', true),
                category('active', 'Bonus'),
            ],
            category('new', 'shopping')
        );

        expect(merged.map((item) => item.id)).toEqual(['active', 'new', 'archived']);
        expect(sortFinanceCategories(merged)).toEqual(merged);
    });

    it('maps shared virtual defaults back to their category name', () => {
        const virtualFood = getFinanceCategoryOptions([]).find(
            (option) => option.label === 'Food'
        );

        expect(virtualFood?.isVirtualDefault).toBe(true);
        expect(getVirtualDefaultCategoryName(virtualFood?.value || '')).toBe('Food');
    });
});
