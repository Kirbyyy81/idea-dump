import type { FinanceCandidatePayload, FinanceOcrRule } from '@/lib/types';
import { compareFinanceParserRules, financeRuleMatches } from '@/lib/finance/core/ruleMatching';

export function applyNotificationRules(payload: FinanceCandidatePayload, text: string, rules: FinanceOcrRule[]) {
    const result = { ...payload, matched_rule_names: [] as string[] };
    let matchedRuleId: string | null = null;
    let categoryAssigned = false;
    let directionAssigned = false;
    let merchantAssigned = false;
    for (const rule of rules.filter(rule => rule.is_active && rule.source === 'manual').sort(compareFinanceParserRules)) {
        if (!financeRuleMatches(rule, text.toLowerCase(), payload.merchant || payload.payee_name)) continue;
        if (rule.source_id && rule.source_id !== payload.source_id) continue;
        if (rule.auto_created_at && payload.direction && rule.direction && rule.direction !== payload.direction) continue;
        matchedRuleId ??= rule.id;
        result.matched_rule_names.push(rule.name);
        if (rule.category_id && !categoryAssigned) { result.category_id = rule.category_id; categoryAssigned = true; }
        if (rule.direction && !directionAssigned) { result.direction = rule.direction; directionAssigned = true; }
        if (rule.match_type === 'merchant_alias' && !merchantAssigned) { result.merchant = rule.name; merchantAssigned = true; }
    }
    return { payload: result, matched_rule_id: matchedRuleId };
}
