import { FINANCE_DEFAULT_EXPENSE_CATEGORIES } from '@/lib/finance/constants';
import { FinanceCategory, FinanceCategoryType } from '@/lib/types';

const VIRTUAL_DEFAULT_PREFIX = '__virtual_default_expense_category__:';

export interface FinanceCategoryOption {
    value: string;
    label: string;
    isVirtualDefault: boolean;
}

export function canonicalFinanceCategoryName(name: string) {
    return name.trim().toLocaleLowerCase('en');
}

function virtualDefaultValue(name: string) {
    return `${VIRTUAL_DEFAULT_PREFIX}${canonicalFinanceCategoryName(name)}`;
}

const virtualDefaultNamesByValue = new Map(
    FINANCE_DEFAULT_EXPENSE_CATEGORIES.map((name) => [virtualDefaultValue(name), name])
);

export function getVirtualDefaultCategoryName(value: string) {
    return virtualDefaultNamesByValue.get(value) ?? null;
}

export function isVirtualDefaultCategoryValue(value: string) {
    return getVirtualDefaultCategoryName(value) !== null;
}

export function getMissingDefaultExpenseCategories(categories: FinanceCategory[]) {
    const persistedNames = new Set(
        categories
            .filter((category) => category.type === 'expense')
            .map((category) => canonicalFinanceCategoryName(category.name))
    );

    return FINANCE_DEFAULT_EXPENSE_CATEGORIES.filter(
        (name) => !persistedNames.has(canonicalFinanceCategoryName(name))
    );
}

export function getFinanceCategoryOptions(
    categories: FinanceCategory[],
    type: FinanceCategoryType,
    options: { includeTypeLabel?: boolean } = {}
): FinanceCategoryOption[] {
    const seenNames = new Set<string>();
    const persistedOptions = categories.flatMap((category) => {
        if (category.is_archived || category.type !== type) return [];

        const canonicalName = canonicalFinanceCategoryName(category.name);
        if (seenNames.has(canonicalName)) return [];
        seenNames.add(canonicalName);

        return [{
            value: category.id,
            label: options.includeTypeLabel ? `${category.name} (${category.type})` : category.name,
            isVirtualDefault: false,
        }];
    });

    if (type !== 'expense') return persistedOptions;

    const virtualOptions = getMissingDefaultExpenseCategories(categories).map((name) => ({
        value: virtualDefaultValue(name),
        label: options.includeTypeLabel
            ? `${name} (expense)`
            : name,
        isVirtualDefault: true,
    }));

    return [...persistedOptions, ...virtualOptions];
}

export function mergeFinanceCategory(
    categories: FinanceCategory[],
    category: FinanceCategory
) {
    const canonicalName = canonicalFinanceCategoryName(category.name);
    const withoutSameCategory = categories.filter((item) => (
        item.id !== category.id
        && !(item.type === category.type && canonicalFinanceCategoryName(item.name) === canonicalName)
    ));
    return [...withoutSameCategory, category];
}
