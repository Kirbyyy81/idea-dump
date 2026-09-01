import {
    FinanceCandidatePayload,
    FinanceOcrFieldLearningRule,
    FinanceOcrFieldTemplate,
    FinanceOcrPayee,
    FinanceOcrRule,
    FinanceOcrSource,
    FinanceOcrSourceTemplate,
    FinanceTransactionDirection,
} from '@/lib/types';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/core/constants';
import { applyLearnedReferenceRules } from '@/lib/finance/ocr/fieldLearning';
import { applyFinanceCriticalFieldTemplates } from '@/lib/finance/ocr/fieldTemplates';
import { normalizeFinanceMerchantKey, normalizeFinancePayeeKey } from '@/lib/finance/ocr/normalizer';
import { extractFinanceReferenceNumber } from '@/lib/finance/ocr/reference';
import {
    extractFinanceRecipientReference,
    mergeFinanceRecipientReferenceIntoNotes,
} from '@/lib/finance/ocr/recipientReference';
import { detectFinanceSource } from '@/lib/finance/ocr/sourceDetection';
import { toIsoDate } from '@/shared/date';

interface ParsedCandidate {
    confidence: number;
    matchedRuleId: string | null;
    payload: FinanceCandidatePayload;
    sourceDetectionSignals: ReturnType<typeof detectFinanceSource>['signals'];
}

const ignoredMerchantTerms = [
    'transaction',
    'successful',
    'receipt',
    'reference',
    'available balance',
    'current balance',
    'amount',
    'date',
    'time',
];

function parseAmount(lines: string[]) {
    const candidates: Array<{ amount: number; score: number }> = [];
    for (const line of lines) {
        const matches = Array.from(line.matchAll(/(?:RM|MYR)?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.([0-9]{2})/gi));
        for (const match of matches) {
            const amount = Number(`${match[1].replace(/,/g, '')}.${match[2]}`);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const lower = line.toLowerCase();
            let score = /(?:amount|total|paid|payment|purchase|transfer)/.test(lower) ? 3 : 1;
            if (/(?:balance|available|limit)/.test(lower)) score -= 3;
            if (/(?:rm|myr)/i.test(match[0])) score += 1;
            candidates.push({ amount, score });
        }
    }

    return candidates.sort((a, b) => b.score - a.score)[0]?.amount ?? null;
}

function parseTransactionDate(text: string) {
    const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
    if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    const local = text.match(/\b([0-2]?\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
    if (local) return toIsoDate(Number(local[3]), Number(local[2]), Number(local[1]));

    const named = text.match(/\b([0-2]?\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
    if (!named) return null;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return toIsoDate(Number(named[3]), months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1, Number(named[1]));
}

function parseDirection(text: string): FinanceTransactionDirection | null {
    const lower = text.toLowerCase();
    if (/(?:received|credited|credit to|incoming|salary|cashback|refund)/.test(lower)) return 'income';
    if (/(?:-\s*(?:rm|myr)\s*\d|paid from|paid|payment|purchase|debited|debit from|spent|merchant|transfer to|\bto\s+[a-z])/i.test(lower)) return 'expense';
    return null;
}

function cleanParty(value: string) {
    return value
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function validParty(value: string) {
    const lower = value.toLowerCase();
    return value.length >= 2
        && value.length <= 500
        && !ignoredMerchantTerms.some((term) => lower.includes(term));
}

function labeledPartyValue(
    lines: string[],
    pattern: RegExp,
) {
    for (let index = 0; index < lines.length; index += 1) {
        const match = pattern.exec(lines[index]);
        if (!match) continue;
        const sameLine = cleanParty(match[1] || '');
        if (validParty(sameLine)) return sameLine;

        for (let nextIndex = index + 1; nextIndex < lines.length && nextIndex <= index + 2; nextIndex += 1) {
            const nextLine = cleanParty(lines[nextIndex] || '');
            if (!nextLine) continue;
            if (/^(?:amount|total|date|time|merchant|payee|recipient|sender|reference|ref|available balance|current balance)\b/i.test(nextLine)) break;
            if (validParty(nextLine)) return nextLine;
        }
    }
    return null;
}

function fallbackParty(lines: string[]) {
    return lines
        .map(cleanParty)
        .find((line) => {
            const lower = line.toLowerCase();
            return line.length >= 3
                && line.length <= 60
                && /[a-z]/i.test(line)
                && !/\d{2,}/.test(line)
                && !ignoredMerchantTerms.some((term) => lower.includes(term));
        }) ?? null;
}

function matchSavedPayee(value: string | null, payees: FinanceOcrPayee[]) {
    const key = normalizeFinancePayeeKey(value);
    if (!key) return null;
    return payees.find((payee) => (
        !payee.is_archived
        && (payee.normalized_name || normalizeFinancePayeeKey(payee.name)) === key
    )) || null;
}

function parseParties(lines: string[], payees: FinanceOcrPayee[]) {
    const explicitMerchant = labeledPartyValue(lines, /^merchant(?:\s+name)?\s*[:\-]?\s*(.*)$/i);
    const explicitPayee = labeledPartyValue(
        lines,
        /^(?:payee|recipient|transfer\s+(?:recipient|to)|to)\b(?!\s+(?:reference|ref))(?:\s+name)?\s*[:\-]?\s*(.*)$/i,
    );
    const savedExplicitPayee = matchSavedPayee(explicitPayee, payees);

    if (explicitMerchant || explicitPayee) {
        return {
            merchant: explicitMerchant,
            payeeId: savedExplicitPayee?.id || null,
            payeeName: savedExplicitPayee?.name || explicitPayee,
        };
    }

    for (const line of lines) {
        const value = cleanParty(line);
        if (!validParty(value)) continue;
        const savedPayee = matchSavedPayee(value, payees);
        if (savedPayee) {
            return { merchant: null, payeeId: savedPayee.id, payeeName: savedPayee.name };
        }
    }

    return { merchant: fallbackParty(lines), payeeId: null, payeeName: null };
}

function ruleMatches(rule: FinanceOcrRule, text: string, merchant: string | null) {
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

function compareFinanceRules(left: FinanceOcrRule, right: FinanceOcrRule) {
    return left.priority - right.priority
        || matchTypeRank[left.match_type] - matchTypeRank[right.match_type]
        || (left.source === right.source ? 0 : left.source === 'manual' ? -1 : 1)
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id);
}

export function parseFinanceText(
    normalizedText: string,
    rules: FinanceOcrRule[],
    sources: FinanceOcrSource[],
    filename: string | null = null,
    fieldLearningRules: FinanceOcrFieldLearningRule[] = [],
    payees: FinanceOcrPayee[] = [],
    sourceTemplates: FinanceOcrSourceTemplate[] = [],
    fieldTemplates: FinanceOcrFieldTemplate[] = [],
): ParsedCandidate {
    const lines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const normalized = lines.join('\n').toLowerCase();
    const sourceDetection = detectFinanceSource(
        normalizedText,
        filename,
        sources.filter((source) => !source.is_archived),
        sourceTemplates,
    );
    const sourceDetectionSignals = [...sourceDetection.signals];
    const sourceSignalsConflict = sourceDetection.hasConflict;
    const parties = parseParties(lines, payees);
    const recipientReference = extractFinanceRecipientReference(normalizedText);
    const payload: FinanceCandidatePayload = {
        amount: parseAmount(lines),
        currency: FINANCE_V1_CURRENCY,
        merchant: parties.merchant,
        payee_id: parties.payeeId,
        payee_name: parties.payeeName,
        direction: parseDirection(normalizedText),
        transaction_date: parseTransactionDate(normalizedText),
        source_id: sourceDetection.sourceId,
        category_id: null,
        reference_number: extractFinanceReferenceNumber(normalizedText),
        notes: mergeFinanceRecipientReferenceIntoNotes(recipientReference, null),
        matched_rule_names: [],
        learned_field_rule_ids: [],
        duplicate_transaction_id: null,
    };

    let firstMatchedRuleId: string | null = null;
    let categoryMatchedRuleId: string | null = null;
    const parsedMerchant = payload.merchant;
    const inferredSourceId = payload.source_id;
    const inferredDirection = payload.direction;
    let sourceAssigned = Boolean(inferredSourceId);
    let categoryAssigned = false;
    let directionAssigned = false;
    let merchantAssigned = false;
    for (const rule of [...rules].filter((rule) => rule.is_active).sort(compareFinanceRules)) {
        if (!ruleMatches(rule, normalized, parsedMerchant)) continue;
        if (rule.auto_created_at && rule.source_id && rule.source_id !== inferredSourceId) continue;
        if (rule.auto_created_at && inferredDirection && rule.direction && rule.direction !== inferredDirection) continue;
        firstMatchedRuleId ??= rule.id;
        payload.matched_rule_names.push(rule.name);
        if (rule.category_id && !categoryAssigned) {
            payload.category_id = rule.category_id;
            categoryAssigned = true;
            categoryMatchedRuleId = rule.id;
        }
        if (rule.source_id && !sourceAssigned) {
            const signaledSourceIds = new Set(sourceDetectionSignals
                .filter((signal) => signal.kind !== 'learned_source_shadow')
                .map((signal) => signal.source_id));
            const canAssignRuleSource = !sourceSignalsConflict && (
                signaledSourceIds.size === 0 || signaledSourceIds.has(rule.source_id)
            );
            if (canAssignRuleSource) {
                payload.source_id = rule.source_id;
                sourceAssigned = true;
                const source = sources.find((item) => item.id === rule.source_id);
                if (source && sourceDetectionSignals.length < 50) {
                    sourceDetectionSignals.push({
                        source_id: source.id,
                        source_name: source.name,
                        kind: 'rule_match',
                        alias: rule.pattern,
                        score: 5,
                    });
                }
            }
        }
        if (rule.direction && !directionAssigned) {
            payload.direction = rule.direction;
            directionAssigned = true;
        }
        if (rule.match_type === 'merchant_alias' && !merchantAssigned) {
            payload.merchant = rule.name;
            merchantAssigned = true;
        }
    }

    const learnedReference = applyLearnedReferenceRules(
        payload.reference_number,
        payload.source_id,
        fieldLearningRules,
    );
    payload.reference_number = learnedReference.referenceNumber;
    payload.learned_field_rule_ids = learnedReference.matchedRuleIds;

    const fieldTemplateResult = applyFinanceCriticalFieldTemplates(
        normalizedText,
        payload,
        payload.source_id,
        fieldTemplates,
    );
    Object.assign(payload, fieldTemplateResult.payload);
    if (fieldTemplateResult.evaluations.length > 0) {
        payload.parser_template_evaluations = fieldTemplateResult.evaluations;
        payload.matched_parser_template_ids = fieldTemplateResult.evaluations
            .filter((evaluation) => evaluation.outcome === 'applied')
            .map((evaluation) => evaluation.template_id);
    }

    let confidence = 0;
    if (payload.amount) confidence += 0.35;
    if (payload.transaction_date) confidence += 0.2;
    if (payload.merchant || payload.payee_name) confidence += 0.15;
    if (payload.direction) confidence += 0.1;
    if (payload.source_id) confidence += 0.1;
    if (payload.category_id) confidence += 0.05;
    const matchedRuleId = categoryMatchedRuleId ?? firstMatchedRuleId;
    if (matchedRuleId) confidence += 0.05;

    return {
        confidence: Math.min(Number(confidence.toFixed(2)), 1),
        matchedRuleId,
        payload,
        sourceDetectionSignals,
    };
}
