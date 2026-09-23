export type FinanceLedgerCategoryIcon =
    | 'entertainment'
    | 'food'
    | 'general'
    | 'health'
    | 'home'
    | 'income'
    | 'shopping'
    | 'transport';

const categoryIconKeywords: Array<{
    icon: Exclude<FinanceLedgerCategoryIcon, 'general'>;
    keywords: string[];
}> = [
    { icon: 'food', keywords: ['food', 'dining', 'drink', 'cafe', 'coffee', 'restaurant', 'grocery', 'groceries', 'meal', 'snack'] },
    { icon: 'transport', keywords: ['transport', 'travel', 'petrol', 'fuel', 'parking', 'toll', 'transit', 'grab'] },
    { icon: 'shopping', keywords: ['shopping', 'retail', 'clothing', 'fashion'] },
    { icon: 'home', keywords: ['home', 'rent', 'utility', 'utilities', 'bill', 'internet', 'phone'] },
    { icon: 'health', keywords: ['health', 'medical', 'pharmacy', 'clinic', 'dental'] },
    { icon: 'income', keywords: ['income', 'salary', 'wage', 'bonus', 'interest', 'dividend'] },
    { icon: 'entertainment', keywords: ['entertainment', 'movie', 'cinema', 'game', 'hobby'] },
];

export function getFinanceLedgerCategoryIcon(categoryName: string | null | undefined) {
    const normalizedName = categoryName?.trim().toLocaleLowerCase('en') || '';
    return categoryIconKeywords.find(({ keywords }) => (
        keywords.some((keyword) => normalizedName.includes(keyword))
    ))?.icon || 'general';
}
