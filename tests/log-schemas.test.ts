import { describe, expect, it } from 'vitest';
import {
    parseCreateLog,
    parseLogListQuery,
    parseUpdateLog,
    parseWeeklyLogExport,
} from '@/lib/logs/core/schemas';

describe('log schemas', () => {
    it('uses the documented default log list query', () => {
        expect(parseLogListQuery(new URLSearchParams())).toEqual({
            data: {
                cursor: undefined,
                from: undefined,
                limit: 200,
                sort: 'created_at.desc',
                to: undefined,
            },
        });
    });

    it('rejects unsupported log query parameters', () => {
        expect(parseLogListQuery(new URLSearchParams({ limit: '0' }))).toEqual({
            error: 'limit must be an integer between 1 and 500',
        });
        expect(parseLogListQuery(new URLSearchParams({ sort: 'title.desc' }))).toEqual({
            error: 'sort must be a supported field and direction',
        });
    });

    it('normalizes a create-log request', () => {
        expect(parseCreateLog({
            content: {
                date: ' 2026-08-05 ',
                operation_task: ' Review the API layer ',
                tools_used: ' Codex ',
            },
            effective_date: ' 2026-08-05 ',
        })).toEqual({
            data: {
                content: {
                    date: '2026-08-05',
                    day: undefined,
                    operation_task: 'Review the API layer',
                    tools_used: 'Codex',
                    lesson_learned: undefined,
                },
                effective_date: '2026-08-05',
            },
        });
    });

    it('requires a date when updating a log', () => {
        expect(parseUpdateLog({ content: { operation_task: 'Missing date' } })).toEqual({
            error: 'content.date is required',
        });
    });

    it('parses a weekly log export request', () => {
        expect(parseWeeklyLogExport({ from: ' 2026-08-01 ', to: '2026-08-05' })).toEqual({
            data: { from: '2026-08-01', to: '2026-08-05' },
        });
    });
});
