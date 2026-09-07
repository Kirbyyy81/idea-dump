import type {
    FinanceOcrFieldTemplate, FinanceOcrPayee, FinanceParserTemplateBaseline,
    FinanceTemplateExtraction,
} from '@/lib/types';
import { templateLines, templateText, templateValue, templatePayee } from './templateValues';
import { getFinanceParserTemplateConfigurationErrors } from './templateContract';

const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const patterns: Record<string, string> = {
    reference_token: '[A-Za-z0-9-]+',
    iso_date: '20[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}',
    day_first_numeric_date: '(?:[0-9]{1,2}/[0-9]{1,2}/20[0-9]{2}|[0-9]{1,2}-[0-9]{1,2}-20[0-9]{2}|[0-9]{1,2}\\.[0-9]{1,2}\\.20[0-9]{2})',
    day_first_named_date: '[0-9]{1,2} ' + month + ' 20[0-9]{2}',
    'yyyy-mm-dd': '20[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}',
    'dd/mm/yyyy': '[0-9]{1,2}/[0-9]{1,2}/20[0-9]{2}',
    'dd-mm-yyyy': '[0-9]{1,2}-[0-9]{1,2}-20[0-9]{2}',
    'dd.mm.yyyy': '[0-9]{1,2}\\.[0-9]{1,2}\\.20[0-9]{2}',
    'dd mmm yyyy': '[0-9]{1,2} ' + month + ' 20[0-9]{2}',
};

// Literal anchor matching uses normalized text, never a generated expression.
function anchorOffsets(text: string, anchor: string) {
    const haystack = text.toLowerCase();
    const needle = anchor.toLowerCase();
    const offsets: number[] = [];
    if (!needle) return offsets;
    let offset = haystack.indexOf(needle);
    while (offset >= 0) {
        offsets.push(offset);
        offset = haystack.indexOf(needle, offset + needle.length);
    }
    return offsets;
}

export function evaluateFinanceExtendedTemplate(
    template: FinanceOcrFieldTemplate, text: string,
    payees: FinanceOcrPayee[] = [], baseline?: FinanceParserTemplateBaseline,
): FinanceTemplateExtraction {
    const config = template.configuration;
    const field = template.field_name;
    const invalid: FinanceTemplateExtraction = { outcome: 'invalid_output' };
    const absent: FinanceTemplateExtraction = { outcome: 'not_applicable' };
    if (field === 'source_id' || field === 'amount') return invalid;
    if (getFinanceParserTemplateConfigurationErrors(field, config).length) return invalid;
    const validate = (raw: string) => {
        const value = templateValue(field, raw);
        return value && field === 'payee_name' ? templatePayee(value, payees)?.name ?? null : value;
    };
    if (config.type === 'strip_prefix' || config.type === 'strip_suffix' || config.type === 'character_filter') {
        if (field !== 'reference_number') return invalid;
        if (!baseline || !Object.hasOwn(baseline, 'reference_number')) return { outcome: 'unresolved_missing_context' };
        if (baseline.reference_number === null) return absent;
        if (typeof baseline.reference_number !== 'string') return invalid;
        const original = templateValue(field, baseline.reference_number);
        if (!original) return invalid;
        let transformed: string;
        if (config.type === 'character_filter') {
            transformed = original.replace(config.mode === 'digits_only' ? /[^0-9]/g : /[^A-Z0-9]/g, '');
        } else {
            const affix = templateText(config.value).toUpperCase();
            if (config.type === 'strip_prefix') {
                if (!original.startsWith(affix)) return absent;
                transformed = original.slice(affix.length);
            } else {
                if (!original.endsWith(affix)) return absent;
                transformed = original.slice(0, -affix.length);
            }
        }
        const value = validate(transformed);
        return !value ? invalid : value === original ? absent : { outcome: 'value', value };
    }

    const lines = templateLines(text).map(templateText);
    const values = new Set<string>();
    let matched = false;
    const capture = (raw: string) => {
        matched = true;
        const value = validate(raw);
        if (value) values.add(value);
    };
    if (config.type === 'bounded_line_window') {
        const anchor = templateText(config.anchor);
        for (let i = 0; i < lines.length; i += 1) {
            if (!anchorOffsets(lines[i], anchor).length) continue;
            matched = true;
            for (let distance = 1; distance <= config.max_lines; distance += 1) {
                const value = lines[i + (config.direction === 'before' ? -distance : distance)];
                if (value) capture(value);
            }
        }
    } else if (config.type === 'allowlisted_regex_capture' || config.type === 'date_format') {
        const patternId = config.type === 'date_format' ? config.input_format : config.pattern_id;
        const pattern = patterns[patternId];
        if (!pattern) return invalid;
        const anchor = config.type === 'allowlisted_regex_capture' && config.anchor ? templateText(config.anchor) : null;
        for (const line of lines) {
            const scopes = anchor ? anchorOffsets(line, anchor).map((offset) => line.slice(offset + anchor.length)) : [line];
            if (anchor && scopes.length) matched = true;
            for (const scope of scopes) {
                for (const match of scope.matchAll(new RegExp(pattern, 'gi'))) {
                    const raw = match[0];
                    const start = match.index!;
                    const before = scope.slice(0, start);
                    const after = scope.slice(start + raw.length);
                    // Do not accept a substring of a longer identifier or date.
                    if (/[\p{L}\p{N}_./-]$/u.test(before) || /^[\p{L}\p{N}_./-]/u.test(after)) continue;
                    if (patternId === 'reference_token' && !/[0-9]/.test(raw)) continue;
                    matched = true;
                    if (patternId === 'reference_token' && (raw.length < 5 || raw.startsWith('-') || raw.endsWith('-'))) continue;
                    capture(raw);
                }
            }
        }
    } else {
        return absent;
    }
    return values.size === 1 ? { outcome: 'value', value: [...values][0] }
        : values.size > 1 || matched ? invalid : absent;
}
