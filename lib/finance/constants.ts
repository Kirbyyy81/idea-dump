import { FinanceCurrency } from '@/lib/types';

export const FINANCE_V1_CURRENCY: FinanceCurrency = 'MYR';
export const FINANCE_AUTO_CONFIRM_THRESHOLD = 0.9;
export const FINANCE_NORMALIZER_VERSION = 1;
export const FINANCE_RULE_AUTO_PROMOTION_SUPPORT = 3;

export const FINANCE_DEFAULT_EXPENSE_CATEGORIES = [
    'Food',
    'Drinks',
    'Transport',
    'Gifts',
] as const;

export const FINANCE_DEFAULT_EXPENSE_CATEGORY_DESCRIPTIONS: Record<(typeof FINANCE_DEFAULT_EXPENSE_CATEGORIES)[number], string> = {
    Food: 'Meals and food purchases.',
    Drinks: 'Coffee, beverages, and other drinks.',
    Transport: 'Public transport, fuel, parking, and ride-hailing.',
    Gifts: 'Presents and gifts for others.',
};

