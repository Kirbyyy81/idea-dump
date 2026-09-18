import { templateLines, templateValue } from '@/lib/finance/ocr/templateValues';

// Baseline receipt fixes, not learned-template definitions or promotion evidence.
export function isTngCardReceipt(text: string) {
    const lines = templateLines(text);
    return [/^Posting Time\s*:?\s+\d{2}\/\d{2}\/20\d{2}\b/i,
        /^Card Balance\s*:?\s+RM\s*\d/i,
        /^Entry Loc\s*:?\s+\S/i,
    ].every((pattern) => lines.some((line) => pattern.test(line)));
}

export function rytQrMerchant(text: string) {
    const lines = templateLines(text);
    if (!lines.some((line) => /^Transaction type\s*:?\s+DuitNow QR$/i.test(line))) return null;
    const values = new Map<string, string>();
    for (const line of lines) {
        const match = /^To\s*:?\s+(.+)$/i.exec(line);
        if (!match) continue;
        const value = templateValue('merchant', match[1]);
        if (!value || !/\p{L}/u.test(value)) return null;
        values.set(value.toLowerCase(), value);
    }
    return values.size === 1 ? [...values.values()][0] : null;
}

export function cleanRytMerchantIcon(text: string, merchant: string | null) {
    if (!merchant) return null;
    const lines = templateLines(text);
    if (!lines.some((line) => /^Successful$/i.test(line))
        || !lines.some((line) => /^RM\s*\d[\d,]*\.\d{2}$/i.test(line))
        || !lines.some((line) => /^Reference ID\b/i.test(line))) return null;
    const candidates = lines.flatMap((line, index) => {
        if (!/^Paid from Main Account$/i.test(line)) return [];
        const previous = lines[index - 1] ?? '';
        // Only the unlabelled fallback at the icon position can be cleaned.
        if (previous !== merchant.normalize('NFKC').trim()) return [];
        const match = /^(?:D|DO) ([\p{L}].+)$/u.exec(previous);
        const value = match && templateValue('merchant', match[1]);
        return value && value.length >= 3 ? [value] : [];
    });
    return candidates.length === 1 ? candidates[0] : null;
}
