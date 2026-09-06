import { toIsoDate } from '@/shared/date';
import { templateLines, templateValue } from '@/lib/finance/ocr/templateValues';
import type { FinanceReferenceLabelTemplateConfiguration, FinanceApprovedReceiptPattern } from '@/lib/types';

export function hasReceiptToday(text: string) {
    return templateLines(text).some((line) => /^today(?:,?\s+(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]m)?)?$/i.test(line));
}

export function screenshotFilenameDate(filename: string | null) {
    const basename = (filename ?? '').split(/[\\/]/).pop() ?? '';
    const match = /^Screenshot[_ -](20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)[_ -]([0-2]\d)[-_:]?([0-5]\d)[-_:]?([0-5]\d)(?:[_ .-]|$)/i.exec(basename);
    if (!match || Number(match[4]) > 23) return null;
    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

// A reference chunk must contain digits and cannot consume ordinary field labels.
function referenceChunk(line: string) {
    const match = /^(?:[^A-Z0-9]|[0-9] )*([A-Z0-9-]{5,200})$/.exec(line.toUpperCase());
    return match && /[0-9]/.test(match[1]) ? match[1] : null;
}

export function receiptReferenceValue(text: string, config: FinanceReferenceLabelTemplateConfiguration): string | null | undefined {
    const lines = templateLines(text);
    const values = new Set<string>();
    let matched = false;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].toLowerCase();
        if (!line.startsWith(config.label)) continue;
        const remainder = line.slice(config.label.length);
        if (remainder && !/^[\s:.-]/.test(remainder)) continue;
        const tail = remainder.replace(/^[\s:.-]+/, '');
        if ((config.placement === 'inline') !== Boolean(tail)) continue;
        matched = true;
        const chunks: string[] = [];
        if (tail) {
            const chunk = referenceChunk(tail);
            if (!chunk) continue;
            chunks.push(chunk);
        }
        const step = config.placement === 'before' ? -1 : 1;
        for (let j = i + step; j >= 0 && j < lines.length && Math.abs(j - i) <= 6 && chunks.length < config.max_lines; j += step) {
            if (!lines[j]) continue;
            const chunk = referenceChunk(lines[j]);
            if (!chunk) break;
            chunks.push(chunk);
        }
        if (chunks.length !== config.max_lines) continue;
        if (step === -1) chunks.reverse();
        const value = chunks.join(config.join === 'space' ? ' ' : '');
        if (value.length <= 200 && !value.startsWith('-') && !value.endsWith('-')) values.add(value);
    }
    return values.size === 1 ? [...values][0] : matched ? null : undefined;
}

function directionSignals(lines: string[]) {
    const signs = lines.map((line) => /^([+-])\s*RM\s*[0-9][0-9,]*\.[0-9]{2}(?:\s|$)/i.exec(line)?.[1]).filter(Boolean);
    const types = lines.flatMap((line) => /^Transaction Type\s+Payment$/i.test(line) ? ['expense'] : /^Transaction Type\s+Receive from Wallet$/i.test(line) ? ['income'] : []);
    return { signs, values: new Set([...signs.map((sign) => sign === '+' ? 'income' : 'expense'), ...types]) };
}

export function receiptDirectionConflict(text: string) {
    return directionSignals(templateLines(text)).values.size > 1;
}

export function approvedReceiptValue(text: string, pattern: FinanceApprovedReceiptPattern): string | null | undefined {
    const lines = templateLines(text);
    if (pattern === 'signed_direction') {
        const signals = directionSignals(lines);
        if (!signals.signs.length) return undefined;
        return signals.values.size > 1 ? null : signals.signs[0] === '+' ? 'income' : 'expense';
    }
    const values = new Set<string>();
    let matched = false;
    for (let i = 0; i < lines.length; i += 1) {
        if (pattern === 'tng_date' || pattern === 'ryt_date') {
            const match = pattern === 'tng_date'
                ? /^Date(?:\/Time| & Time)\s+(\d{2}\/\d{2}\/20\d{2})(?:\s|$)/i.exec(lines[i])
                : /^(\d{1,2} [A-Za-z]{3} 20\d{2})(?:,|$)/.exec(lines[i]);
            if (!match) continue;
            matched = true;
            const value = templateValue('transaction_date', match[1]);
            if (value) values.add(value);
        } else if (pattern === 'tng_wallet_before') {
            if (!/^Wallet Ref(?:\s+[^A-Za-z]{0,5})?$/i.test(lines[i])) continue;
            const previous = lines[i - 1] ?? '';
            if (/^[0-9]{20,200}$/.test(previous)) { matched = true; values.add(previous); }
        } else if (pattern === 'tng_wallet_wrapped') {
            const match = /^Wallet Ref\s+([A-Za-z0-9]{20,200})$/i.exec(lines[i]);
            if (!match) continue;
            const next = lines.slice(i + 1, i + 4).find((line) => line !== '') ?? '';
            if (!/^[0-9]{10,30}$/.test(next)) continue;
            matched = true;
            const value = (match[1] + ' ' + next).toUpperCase();
            if (value.length <= 200) values.add(value);
        }
    }
    return values.size === 1 ? [...values][0] : matched ? null : undefined;
}
