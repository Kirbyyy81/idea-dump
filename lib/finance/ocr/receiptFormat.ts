import type { FinanceReceiptFormat } from '@/lib/types';

export function receiptFormatMatches(scope: string | null | undefined, format: FinanceReceiptFormat) {
    return scope ? scope === format : format !== 'ryt_shared_v1';
}

// Used only after the Ryt shared layout has been independently identified.
export function rytTransactionText(text: string) {
    const lines = text.split(/\r?\n/);
    const end = lines.findIndex((line) => /(?:join\s+ryt\s+bank|download\s+now|this receipt is computer|YTL Digital Bank)/i.test(line));
    return lines.slice(0, end < 0 ? undefined : end)
        .map((line) => line.replace(/^[^A-Za-z\n]*\b(Recipient|Reference ID)\s*$/i, '$1'))
        .join('\n').trim();
}

export function isRytPartyNoise(value: string) {
    return /^(?:recipient|payee|merchant|(?:recipient )?reference(?: id)?|transfer|ryt bank|logo)$|(?:duitnow|buitnow|buithow|\|)/i.test(value.trim());
}
