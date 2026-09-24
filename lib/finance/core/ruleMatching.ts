import type { FinanceOcrRule } from '@/lib/types';
import { normalizeFinanceMerchantKey } from '@/lib/finance/ocr/normalizer';

export function financeRuleMatches(rule: FinanceOcrRule, text: string, merchant: string | null) {
    const pattern = rule.pattern.trim().toLowerCase();
    if (!pattern) return false;
    if (rule.match_type === 'merchant_alias') {
        if (rule.auto_created_at) {
            return Boolean(
                merchant
                && normalizeFinanceMerchantKey(merchant) === normalizeFinanceMerchantKey(rule.pattern)
            );
        }
        return Boolean(merchant?.toLowerCase().includes(pattern));
    }
    return text.includes(pattern);
}

const matchTypeRank: Record<FinanceOcrRule['match_type'], number> = {
    exact_phrase: 0,
    merchant_alias: 1,
    keyword: 2,
    account_hint: 3,
};

export function compareFinanceParserRules(left: FinanceOcrRule, right: FinanceOcrRule) {
    return left.priority - right.priority
        || matchTypeRank[left.match_type] - matchTypeRank[right.match_type]
        || (left.source === right.source ? 0 : left.source === 'manual' ? -1 : 1)
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id);
}

