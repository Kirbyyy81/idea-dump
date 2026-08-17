import { FINANCE_DEFAULT_CATEGORIES } from '@/lib/finance/core/constants';
import { FinanceCategory } from '@/lib/types';

const VIRTUAL_DEFAULT_PREFIX = '__virtual_default_category__:';

export interface FinanceCategoryOption {
    value: string;
    label: string;
    isVirtualDefault: boolean;
    disabled?: boolean;
}

export function canonicalFinanceCategoryName(name: string) {
    return name.trim().toLocaleLowerCase('en');
}

function virtualDefaultValue(name: string) {
    return `${VIRTUAL_DEFAULT_PREFIX}${canonicalFinanceCategoryName(name)}`;
}

const virtualDefaultNamesByValue = new Map(
    FINANCE_DEFAULT_CATEGORIES.map((name) => [virtualDefaultValue(name), name])
);

export function getVirtualDefaultCategoryName(value: string) {
    return virtualDefaultNamesByValue.get(value) ?? null;
}

export function isVirtualDefaultCategoryValue(value: string) {
    return getVirtualDefaultCategoryName(value) !== null;
}

export function sortFinanceCategories(categories: FinanceCategory[]) {
    return [...categories].sort((left, right) => {
        if (left.is_archived !== right.is_archived) return left.is_archived ? 1 : -1;
        return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
    });
}

export function getMissingDefaultCategories(categories: FinanceCategory[]) {
    const persistedNames = new Set(
        categories
            .map((category) => canonicalFinanceCategoryName(category.name))
    );

    return FINANCE_DEFAULT_CATEGORIES.filter(
        (name) => !persistedNames.has(canonicalFinanceCategoryName(name))
    );
}

export function getFinanceCategoryOptions(
    categories: FinanceCategory[],
    options: { currentCategoryId?: string } = {}
): FinanceCategoryOption[] {
    const seenNames = new Set<string>();
    const persistedOptions = sortFinanceCategories(categories).flatMap((category) => {
        const isCurrentArchivedCategory = category.is_archived
            && category.id === options.currentCategoryId;
        if (category.is_archived && !isCurrentArchivedCategory) return [];

        const canonicalName = canonicalFinanceCategoryName(category.name);
        if (seenNames.has(canonicalName)) return [];
        seenNames.add(canonicalName);

        return [{
            value: category.id,
            label: isCurrentArchivedCategory ? `${category.name} (archived)` : category.name,
            isVirtualDefault: false,
            disabled: isCurrentArchivedCategory,
        }];
    });

    const virtualOptions = getMissingDefaultCategories(categories).map((name) => ({
        value: virtualDefaultValue(name),
        label: name,
        isVirtualDefault: true,
    }));

    return [...persistedOptions, ...virtualOptions].sort((left, right) => (
        left.label.localeCompare(right.label, 'en', { sensitivity: 'base' })
    ));
}

export function mergeFinanceCategory(
    categories: FinanceCategory[],
    category: FinanceCategory
) {
    const canonicalName = canonicalFinanceCategoryName(category.name);
    const withoutSameCategory = categories.filter((item) => (
        item.id !== category.id
        && canonicalFinanceCategoryName(item.name) !== canonicalName
    ));
    return sortFinanceCategories([...withoutSameCategory, category]);
}
