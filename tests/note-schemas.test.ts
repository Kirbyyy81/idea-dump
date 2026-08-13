import { describe, expect, it } from 'vitest';
import { parseCreateNote, parseNoteId, parseNoteProjectId } from '@/lib/notes/core/schemas';

describe('note schemas', () => {
    it('normalizes note creation input', () => {
        expect(parseCreateNote({
            project_id: ' project-1 ',
            content: ' Keep this note ',
        })).toEqual({
            data: { projectId: 'project-1', content: 'Keep this note' },
        });
    });

    it('requires note identifiers and text content', () => {
        expect(parseNoteProjectId(null)).toEqual({ error: 'Project ID is required' });
        expect(parseNoteId('')).toEqual({ error: 'Note ID is required' });
        expect(parseCreateNote({ project_id: 'project-1', content: '  ' })).toEqual({
            error: 'Project ID and content are required',
        });
    });
});
