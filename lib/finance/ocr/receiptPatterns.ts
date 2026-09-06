import { toIsoDate } from '@/shared/date';
import { templateLines } from '@/lib/finance/ocr/templateValues';
import type { FinanceReferenceLabelTemplateConfiguration } from '@/lib/types';

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
