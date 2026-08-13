import { describe, expect, it } from 'vitest';
import {
    parseCreateTicket,
    parseTicketId,
    parseTicketListQuery,
    parseUpdateTicket,
} from '@/lib/tickets/core/schemas';

const projectId = '570e7f56-e8a8-4e7d-9f4b-6ab5e5481635';

describe('ticket schemas', () => {
    it('parses documented ticket list filters', () => {
        const result = parseTicketListQuery(new URLSearchParams({
            project_id: projectId,
            status: 'to_review',
            priority: 'high',
            source: 'user_tester',
            scope: 'manage',
        }));

        expect(result).toEqual({
            data: {
                projectId,
                status: 'to_review',
                priority: 'high',
                source: 'user_tester',
                scope: 'manage',
            },
        });
    });

    it('rejects invalid ticket identifiers and scopes', () => {
        expect(parseTicketId('not-a-ticket-id')).toEqual({
            error: 'Ticket ID must be a valid UUID',
        });
        expect(parseTicketListQuery(new URLSearchParams({ scope: 'all' }))).toEqual({
            error: 'Invalid ticket scope',
        });
    });

    it('normalizes create input and applies ticket defaults', () => {
        expect(parseCreateTicket({
            project_id: ` ${projectId} `,
            title: '  Review import workflow  ',
            description: '  Confirm import behavior  ',
            notes: '',
            tags: [' finance ', '', 'review'],
        })).toEqual({
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

    it('allows an update to clear nullable ticket fields', () => {
        expect(parseUpdateTicket({
            description: null,
            notes: '  Follow up with screenshots  ',
            tags: [' ux '],
        })).toEqual({
            data: {
                description: null,
                notes: 'Follow up with screenshots',
                tags: ['ux'],
            },
        });
    });
});
