import { DailyLogContent, DailyLogEntry, LogSource } from '@/lib/types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function coerceLogSource(value: unknown): LogSource {
    return value === 'agent' ? 'agent' : 'human';
}

export function coerceDailyLogContent(input: unknown, fallbackDate?: string): DailyLogContent {
    if (isRecord(input)) {
        const date = asString(input.date) ?? fallbackDate ?? '';
        return {
            date,
            day: asString(input.day),
            operation_task: asString(input.operation_task),
            tools_used: asString(input.tools_used),
            lesson_learned: asString(input.lesson_learned),
        };
    }

    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (isRecord(parsed)) return coerceDailyLogContent(parsed, fallbackDate);
            } catch {
                // ignore JSON parse errors and fall back to plain text content
            }
        }

        return {
            date: fallbackDate ?? '',
            operation_task: input,
        };
    }

    return { date: fallbackDate ?? '' };
}

export function normalizeDailyLogEntry(row: unknown): DailyLogEntry {
    const raw = row as Partial<DailyLogEntry> & UnknownRecord;
    const effectiveDate =
        asString(raw.effective_date) ??
        (typeof raw.created_at === 'string' ? raw.created_at.slice(0, 10) : undefined);

    const content = coerceDailyLogContent(raw.content, effectiveDate);
    const normalizedEffectiveDate = content.date || effectiveDate || '';

    return {
        ...(raw as DailyLogEntry),
        source: coerceLogSource(raw.source),
        content,
        effective_date: normalizedEffectiveDate,
    };
}

