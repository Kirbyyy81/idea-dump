import {
    FinanceAccount,
    FinanceCandidatePayload,
    FinanceRule,
    FinanceTransactionDirection,
} from '@/lib/types';

interface ParsedCandidate {
    confidence: number;
    matchedRuleId: string | null;
    payload: FinanceCandidatePayload;
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

function toIsoDate(year: number, month: number, day: number) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
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
    if (/(?:paid|payment|purchase|debited|debit from|spent|merchant|transfer to)/.test(lower)) return 'expense';
    return null;
}

function cleanMerchant(value: string) {
    return value
        .replace(/^(?:to|merchant|recipient|payee)\s*[:\-]?\s*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function parseMerchant(lines: string[]) {
    for (const line of lines) {
        if (/^(?:to|merchant|recipient|payee)\s*[:\-]/i.test(line)) {
            const merchant = cleanMerchant(line);
            if (merchant.length >= 2) return merchant;
        }
    }

    return lines
        .map(cleanMerchant)
        .find((line) => {
            const lower = line.toLowerCase();
            return line.length >= 3
                && line.length <= 60
                && /[a-z]/i.test(line)
                && !/\d{2,}/.test(line)
                && !ignoredMerchantTerms.some((term) => lower.includes(term));
        }) ?? null;
}

function parseReference(text: string) {
    const match = text.match(/(?:reference|ref(?:erence)?\s*(?:no\.?)?)\s*[:#-]?\s*([A-Z0-9-]{5,})/i);
    return match?.[1] ?? null;
}

function inferAccount(text: string, accounts: FinanceAccount[]) {
    const lower = text.toLowerCase();
    const matching = accounts.filter((account) =>
        [account.name, account.institution]
            .filter(Boolean)
            .some((value) => lower.includes(String(value).toLowerCase()))
    );
    if (matching.length === 1) return matching[0].id;
    return accounts.length === 1 ? accounts[0].id : null;
}

function ruleMatches(rule: FinanceRule, text: string, merchant: string | null) {
    const pattern = rule.pattern.trim().toLowerCase();
    if (!pattern) return false;
    if (rule.match_type === 'merchant_alias') return Boolean(merchant?.toLowerCase().includes(pattern));
    return text.includes(pattern);
}

export function parseFinanceText(text: string, rules: FinanceRule[], accounts: FinanceAccount[]): ParsedCandidate {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const normalized = lines.join('\n').toLowerCase();
    const payload: FinanceCandidatePayload = {
        amount: parseAmount(lines),
        merchant: parseMerchant(lines),
        direction: parseDirection(text),
        transaction_date: parseTransactionDate(text),
        account_id: inferAccount(text, accounts.filter((account) => !account.is_archived)),
        category_id: null,
        reference: parseReference(text),
        matched_rule_names: [],
        duplicate_transaction_id: null,
    };

    let matchedRuleId: string | null = null;
    for (const rule of [...rules].filter((rule) => rule.is_active).sort((a, b) => a.priority - b.priority)) {
        if (!ruleMatches(rule, normalized, payload.merchant)) continue;
        matchedRuleId ??= rule.id;
        payload.matched_rule_names.push(rule.name);
        if (rule.category_id) payload.category_id = rule.category_id;
        if (rule.account_id) payload.account_id = rule.account_id;
        if (rule.direction) payload.direction = rule.direction;
        if (rule.match_type === 'merchant_alias') payload.merchant = rule.name;
    }

    let confidence = 0;
    if (payload.amount) confidence += 0.35;
    if (payload.transaction_date) confidence += 0.2;
    if (payload.merchant) confidence += 0.15;
    if (payload.direction) confidence += 0.1;
    if (payload.account_id) confidence += 0.1;
    if (payload.category_id) confidence += 0.05;
    if (matchedRuleId) confidence += 0.05;

    return { confidence: Math.min(Number(confidence.toFixed(2)), 1), matchedRuleId, payload };
}
