import type { CreateDailyLogInput, DailyLogContent, UpdateDailyLogInput } from '@/lib/types';

const LOG_SORTS = new Set([
    'created_at.asc',
    'created_at.desc',
    'updated_at.asc',
    'updated_at.desc',
    'effective_date.asc',
    'effective_date.desc',
]);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export interface LogListQuery {
    cursor?: string;
    from?: string;
    limit: number;
    sort: string;
    to?: string;
}

export interface WeeklyLogExportRequest {
    from: string;
    to: string;
}

export type LogValidationResult<T> = { data: T } | { error: string };

export async function readLogRequestBody(request: Request): Promise<LogValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimOptionalText(value: unknown, fieldName: string): LogValidationResult<string | undefined> {
    if (value === undefined || value === null) return { data: undefined };
    if (typeof value !== 'string') return { error: `${fieldName} must be a string` };

    return { data: value.trim() || undefined };
}

function parseLogContent(value: unknown): LogValidationResult<DailyLogContent> {
    if (!isRecord(value)) return { error: 'content must be an object' };

    const date = typeof value.date === 'string' ? value.date.trim() : '';
    if (!date) return { error: 'content.date is required' };

    const day = trimOptionalText(value.day, 'content.day');
    if ('error' in day) return day;
    const operationTask = trimOptionalText(value.operation_task, 'content.operation_task');
    if ('error' in operationTask) return operationTask;
    const toolsUsed = trimOptionalText(value.tools_used, 'content.tools_used');
    if ('error' in toolsUsed) return toolsUsed;
    const lessonLearned = trimOptionalText(value.lesson_learned, 'content.lesson_learned');
    if ('error' in lessonLearned) return lessonLearned;

    return {
        data: {
            date,
            day: day.data,
            operation_task: operationTask.data,
            tools_used: toolsUsed.data,
            lesson_learned: lessonLearned.data,
        },
    };
}

export function parseLogListQuery(searchParams: URLSearchParams): LogValidationResult<LogListQuery> {
    const rawLimit = searchParams.get('limit');
    const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
        return { error: `limit must be an integer between 1 and ${MAX_LIMIT}` };
    }

    const rawSort = searchParams.get('sort') || 'created_at.desc';
    if (!LOG_SORTS.has(rawSort)) {
        return { error: 'sort must be a supported field and direction' };
    }

    const cursor = trimOptionalText(searchParams.get('cursor'), 'cursor');
    if ('error' in cursor) return cursor;
    const from = trimOptionalText(searchParams.get('from'), 'from');
    if ('error' in from) return from;
    const to = trimOptionalText(searchParams.get('to'), 'to');
    if ('error' in to) return to;

    return {
        data: {
            cursor: cursor.data,
            from: from.data,
            limit: parsedLimit,
            sort: rawSort,
            to: to.data,
        },
    };
}

export function parseCreateLog(body: unknown): LogValidationResult<CreateDailyLogInput> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const content = parseLogContent(body.content);
    if ('error' in content) return content;
    const effectiveDate = trimOptionalText(body.effective_date, 'effective_date');
    if ('error' in effectiveDate) return effectiveDate;

    return {
        data: {
            content: content.data,
            effective_date: effectiveDate.data,
        },
    };
}

export function parseUpdateLog(body: unknown): LogValidationResult<UpdateDailyLogInput> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const content = parseLogContent(body.content);
    if ('error' in content) return content;

    return { data: { content: content.data } };
}

export function parseWeeklyLogExport(body: unknown): LogValidationResult<WeeklyLogExportRequest> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const from = typeof body.from === 'string' ? body.from.trim() : '';
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    if (!from || !to) return { error: 'from and to dates are required' };

    return { data: { from, to } };
}
