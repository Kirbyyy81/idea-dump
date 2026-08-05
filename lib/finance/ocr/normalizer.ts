import { createHash } from 'node:crypto';
import { FINANCE_NORMALIZER_VERSION } from '@/lib/finance/constants';

export interface NormalizedFinanceText {
    text: string;
    version: number;
}

/**
 * Conservatively normalizes OCR output without guessing at ambiguous glyphs or
 * changing numeric values. Keep changes versioned because the normalized value
 * is also the input to duplicate hashes and rule matching.
 */
export function normalizeFinanceOcrText(rawText: string): NormalizedFinanceText {
    const lines = rawText
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map((line) => line.replace(/[\t ]+/g, ' ').trim());

    while (lines[0] === '') lines.shift();
    while (lines[lines.length - 1] === '') lines.pop();

    return {
        text: lines.join('\n').replace(/\bMYR\b(?=\s*[0-9])/gi, 'RM'),
        version: FINANCE_NORMALIZER_VERSION,
    };
}

export function hashNormalizedFinanceText(normalizedText: string) {
    return createHash('sha256').update(normalizedText, 'utf8').digest('hex');
}

export function normalizeFinanceMerchantKey(value: string | null | undefined) {
    return Array.from((value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('en'))
        .filter((character) => (
            character >= '0' && character <= '9'
        ) || character.toLocaleLowerCase('en') !== character.toLocaleUpperCase('en'))
        .join('');
}
