const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseCreateLog,
    parseLogListQuery,
    parseUpdateLog,
    parseWeeklyLogExport,
} = require('../lib/logs/schemas.ts');

test('uses the documented default log list query', () => {
    assert.deepEqual(parseLogListQuery(new URLSearchParams()), {
        data: {
            cursor: undefined,
            from: undefined,
            limit: 200,
            sort: 'created_at.desc',
            to: undefined,
        },
    });
});

test('rejects unsupported log query parameters', () => {
    assert.deepEqual(parseLogListQuery(new URLSearchParams({ limit: '0' })), {
        error: 'limit must be an integer between 1 and 500',
    });
    assert.deepEqual(parseLogListQuery(new URLSearchParams({ sort: 'title.desc' })), {
        error: 'sort must be a supported field and direction',
    });
});

test('normalizes a create-log request', () => {
    assert.deepEqual(parseCreateLog({
        content: {
            date: ' 2026-08-05 ',
            operation_task: ' Review the API layer ',
            tools_used: ' Codex ',
        },
        effective_date: ' 2026-08-05 ',
    }), {
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

test('requires a date when updating a log', () => {
    assert.deepEqual(parseUpdateLog({ content: { operation_task: 'Missing date' } }), {
        error: 'content.date is required',
    });
});

test('parses a weekly log export request', () => {
    assert.deepEqual(parseWeeklyLogExport({ from: ' 2026-08-01 ', to: '2026-08-05' }), {
        data: { from: '2026-08-01', to: '2026-08-05' },
    });
});
