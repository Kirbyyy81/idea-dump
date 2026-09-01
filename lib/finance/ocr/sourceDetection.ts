import type {
    FinanceOcrSource,
    FinanceOcrSourceTemplate,
    FinanceSourceDetectionSignal,
} from '@/lib/types';
import {
    isFinanceParserTemplateContract,
    orderFinanceParserTemplates,
    selectFinanceParserTemplateProposal,
} from '@/lib/finance/ocr/templateContract';

const MAX_SOURCE_ALIASES = 20;
const MAX_SOURCE_ALIAS_LENGTH = 120;
const SOURCE_TEMPLATE_LINE_SCOPE = 3;

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

function sourceIds(signals: FinanceSourceDetectionSignal[], kind: FinanceSourceDetectionSignal['kind']) {
    return new Set(signals.filter((signal) => signal.kind === kind).map((signal) => signal.source_id));
}

function templateMatches(
    template: FinanceOcrSourceTemplate,
    normalizedFilename: string,
    normalizedLines: string[],
) {
    if (template.configuration.type !== 'source_phrase') return false;
    const phrase = normalizeFinanceSourceSignal(template.configuration.phrase);
    if (phrase.length < 3) return false;
    const location = template.configuration.location;
    if (location === 'filename') return containsSignal(normalizedFilename, phrase);
    const lines = location === 'header'
        ? normalizedLines.slice(0, SOURCE_TEMPLATE_LINE_SCOPE)
        : location === 'footer'
            ? normalizedLines.slice(-SOURCE_TEMPLATE_LINE_SCOPE)
            : normalizedLines;
    return lines.some((line) => containsSignal(line, phrase));
}

function evaluateSourceTemplates(
    text: string,
    filename: string | null,
    templates: FinanceOcrSourceTemplate[],
    sources: FinanceOcrSource[],
) {
    const sourceById = new Map(sources.filter((source) => !source.is_archived).map((source) => [source.id, source]));
    const normalizedFilename = normalizeFinanceSourceSignal(filename ?? '');
    const normalizedLines = text
        .split(/\r?\n/)
        .map(normalizeFinanceSourceSignal)
        .filter(Boolean);
    const activeProposals: Array<{ template: FinanceOcrSourceTemplate; value: string }> = [];
    const signals: FinanceSourceDetectionSignal[] = [];

    const validTemplates = templates.filter(isFinanceParserTemplateContract);
    for (const template of orderFinanceParserTemplates(validTemplates, null)) {
        if (
            template.field_name !== 'source_id'
            || template.template_type !== 'source_phrase'
            || (template.status !== 'active' && template.status !== 'shadow')
            || !template.target_source_id
        ) continue;
        const source = sourceById.get(template.target_source_id);
        if (!source || !templateMatches(template, normalizedFilename, normalizedLines)) continue;
        signals.push({
            source_id: source.id,
            source_name: source.name,
            kind: template.status === 'active' ? 'learned_source_active' : 'learned_source_shadow',
            alias: 'learned source template',
            score: template.status === 'active' ? 4 : 0,
            template_id: template.id,
            template_status: template.status,
        });
        if (template.status === 'active') activeProposals.push({ template, value: source.id });
    }

    return {
        signals,
        activeDecision: selectFinanceParserTemplateProposal(activeProposals, null),
    };
}

export function detectFinanceSource(
    text: string,
    filename: string | null,
    sources: FinanceOcrSource[],
    sourceTemplates: FinanceOcrSourceTemplate[] = [],
) {
    const normalizedText = normalizeFinanceSourceSignal(text);
    const normalizedFilename = normalizeFinanceSourceSignal(filename ?? '');
    const baselineSignals: FinanceSourceDetectionSignal[] = [];

    for (const source of sources) {
        const filenameAliases = [source.name, ...(source.filename_aliases ?? [])];
        const ocrAliases = [source.name, ...(source.ocr_aliases ?? [])];
        const seen = new Set<string>();
        for (const alias of filenameAliases) {
            const key = `filename:${normalizeFinanceSourceSignal(alias)}`;
            if (seen.has(key) || !containsSignal(normalizedFilename, alias)) continue;
            seen.add(key);
            baselineSignals.push({ source_id: source.id, source_name: source.name, kind: 'filename_alias', alias, score: 3 });
        }
        for (const alias of ocrAliases) {
            const key = `ocr:${normalizeFinanceSourceSignal(alias)}`;
            if (seen.has(key) || !containsSignal(normalizedText, alias)) continue;
            seen.add(key);
            baselineSignals.push({ source_id: source.id, source_name: source.name, kind: 'ocr_alias', alias, score: 4 });
        }
    }

    const filenameSourceIds = sourceIds(baselineSignals, 'filename_alias');
    const ocrSourceIds = sourceIds(baselineSignals, 'ocr_alias');
    if (sourceTemplates.length === 0) {
        const sourceId = filenameSourceIds.size === 1
            ? Array.from(filenameSourceIds)[0]
            : filenameSourceIds.size === 0 && ocrSourceIds.size === 1
                ? Array.from(ocrSourceIds)[0]
                : null;
        return {
            sourceId,
            signals: baselineSignals.slice(0, 50),
            hasConflict: filenameSourceIds.size > 1
                || (filenameSourceIds.size === 0 && ocrSourceIds.size > 1),
        };
    }

    const sourceTemplateResult = evaluateSourceTemplates(text, filename, sourceTemplates, sources);
    const configuredOcrSourceIds = new Set(
        baselineSignals
            .filter((signal) => signal.kind === 'ocr_alias')
            .filter((signal) => {
                const source = sources.find((item) => item.id === signal.source_id);
                return (source?.ocr_aliases ?? []).some((alias) => (
                    normalizeFinanceSourceSignal(alias) === normalizeFinanceSourceSignal(signal.alias)
                ));
            })
            .map((signal) => signal.source_id),
    );
    const genericOcrSourceIds = new Set(
        baselineSignals
            .filter((signal) => signal.kind === 'ocr_alias')
            .filter((signal) => {
                const source = sources.find((item) => item.id === signal.source_id);
                return source && normalizeFinanceSourceSignal(source.name) === normalizeFinanceSourceSignal(signal.alias);
            })
            .map((signal) => signal.source_id),
    );

    let sourceId: string | null = null;
    let hasConflict = false;
    if (filenameSourceIds.size > 0) {
        sourceId = filenameSourceIds.size === 1 ? Array.from(filenameSourceIds)[0] : null;
        hasConflict = filenameSourceIds.size > 1;
    } else if (configuredOcrSourceIds.size > 0) {
        sourceId = configuredOcrSourceIds.size === 1 ? Array.from(configuredOcrSourceIds)[0] : null;
        hasConflict = configuredOcrSourceIds.size > 1;
    } else if (sourceTemplateResult.activeDecision.status === 'selected') {
        sourceId = String(sourceTemplateResult.activeDecision.proposal.value);
    } else if (sourceTemplateResult.activeDecision.status === 'conflict') {
        hasConflict = true;
    } else {
        sourceId = genericOcrSourceIds.size === 1 ? Array.from(genericOcrSourceIds)[0] : null;
        hasConflict = genericOcrSourceIds.size > 1;
    }

    const signals = [
        ...baselineSignals.filter((signal) => signal.kind === 'filename_alias'),
        ...sourceTemplateResult.signals,
        ...baselineSignals.filter((signal) => signal.kind === 'ocr_alias'),
    ].slice(0, 50);
    return { sourceId, signals, hasConflict };
}
