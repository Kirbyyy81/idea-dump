import { FinanceSource, FinanceSourceDetectionSignal } from '@/lib/types';

const MAX_SOURCE_ALIASES = 20;
const MAX_SOURCE_ALIAS_LENGTH = 120;

const sourcePresets: Record<string, { filenameAliases: string[]; ocrAliases: string[] }> = {
    'ryt bank': {
        filenameAliases: ['Ryt Bank'],
        ocrAliases: ['Ryt Bank'],
    },
};

export function normalizeFinanceSourceSignal(value: string) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .replace(/_/g, ' ')
        .replace(/[^\w\u00c0-\uffff]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

export function normalizeFinanceSourceAliases(value: unknown) {
    if (!Array.isArray(value) || value.length > MAX_SOURCE_ALIASES) return null;
    const aliases: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        if (typeof item !== 'string') return null;
        const alias = item.normalize('NFKC').trim().replace(/\s+/g, ' ');
        const key = normalizeFinanceSourceSignal(alias);
        if (!key || alias.length > MAX_SOURCE_ALIAS_LENGTH) return null;
        if (!seen.has(key)) {
            aliases.push(alias);
            seen.add(key);
        }
    }
    return aliases;
}

export function getFinanceSourcePreset(name: string) {
    return sourcePresets[normalizeFinanceSourceSignal(name)] ?? { filenameAliases: [], ocrAliases: [] };
}

function containsSignal(haystack: string, alias: string) {
    const normalizedAlias = normalizeFinanceSourceSignal(alias);
    return normalizedAlias.length >= 3 && (` ${haystack} `).includes(` ${normalizedAlias} `);
}

export function detectFinanceSource(text: string, filename: string | null, sources: FinanceSource[]) {
    const normalizedText = normalizeFinanceSourceSignal(text);
    const normalizedFilename = normalizeFinanceSourceSignal(filename ?? '');
    const signals: FinanceSourceDetectionSignal[] = [];

    for (const source of sources) {
        const filenameAliases = [source.name, ...(source.filename_aliases ?? [])];
        const ocrAliases = [source.name, ...(source.ocr_aliases ?? [])];
        const seen = new Set<string>();
        for (const alias of filenameAliases) {
            const key = `filename:${normalizeFinanceSourceSignal(alias)}`;
            if (seen.has(key) || !containsSignal(normalizedFilename, alias)) continue;
            seen.add(key);
            signals.push({ source_id: source.id, source_name: source.name, kind: 'filename_alias', alias, score: 3 });
        }
        for (const alias of ocrAliases) {
            const key = `ocr:${normalizeFinanceSourceSignal(alias)}`;
            if (seen.has(key) || !containsSignal(normalizedText, alias)) continue;
            seen.add(key);
            signals.push({ source_id: source.id, source_name: source.name, kind: 'ocr_alias', alias, score: 4 });
        }
    }

    const signaledSourceIds = new Set(signals.map((signal) => signal.source_id));
    const ocrSourceIds = new Set(
        signals
            .filter((signal) => signal.kind === 'ocr_alias')
            .map((signal) => signal.source_id)
    );

    // A filename is useful evidence, but it is controlled by the client and can
    // never identify a source by itself. Any cross-source disagreement is left
    // unresolved for review rather than being hidden by score ordering.
    const sourceId = signaledSourceIds.size === 1 && ocrSourceIds.size === 1
        ? Array.from(ocrSourceIds)[0]
        : null;
    return { sourceId, signals: signals.slice(0, 50) };
}
