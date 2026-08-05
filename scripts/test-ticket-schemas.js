const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseCreateTicket,
    parseTicketId,
    parseTicketListQuery,
    parseUpdateTicket,
} = require('../lib/tickets/core/schemas.ts');

const projectId = '570e7f56-e8a8-4e7d-9f4b-6ab5e5481635';
const ticketId = '2d1e1cba-bc3e-4a40-b06a-46b5c1982481';

test('parses documented ticket list filters', () => {
    const result = parseTicketListQuery(new URLSearchParams({
        project_id: projectId,
        status: 'to_review',
        priority: 'high',
        source: 'user_tester',
        scope: 'manage',
    }));

    assert.deepEqual(result, {
        data: {
            projectId,
            status: 'to_review',
            priority: 'high',
            source: 'user_tester',
            scope: 'manage',
        },
    });
});

test('rejects invalid ticket identifiers and scopes', () => {
    assert.deepEqual(parseTicketId('not-a-ticket-id'), {
        error: 'Ticket ID must be a valid UUID',
    });
    assert.deepEqual(parseTicketListQuery(new URLSearchParams({ scope: 'all' })), {
        error: 'Invalid ticket scope',
    });
});

test('normalizes create input and applies ticket defaults', () => {
    assert.deepEqual(parseCreateTicket({
        project_id: ` ${projectId} `,
        title: '  Review import workflow  ',
        description: '  Confirm import behavior  ',
        notes: '',
        tags: [' finance ', '', 'review'],
    }), {
        data: {
            projectId,
            title: 'Review import workflow',
            description: 'Confirm import behavior',
            notes: null,
            status: 'todo',
            priority: 'medium',
            source: 'self',
            tags: ['finance', 'review'],
        },
    });
});

test('allows an update to clear nullable ticket fields', () => {
    assert.deepEqual(parseUpdateTicket({
        description: null,
        notes: '  Follow up with screenshots  ',
        tags: [' ux '],
    }), {
        data: {
            description: null,
            notes: 'Follow up with screenshots',
            tags: ['ux'],
        },
    });
});
