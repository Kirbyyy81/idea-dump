const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseCreateNote,
    parseNoteId,
    parseNoteProjectId,
} = require('../lib/notes/core/schemas.ts');

test('normalizes note creation input', () => {
    assert.deepEqual(parseCreateNote({
        project_id: ' project-1 ',
        content: ' Keep this note ',
    }), {
        data: {
            projectId: 'project-1',
            content: 'Keep this note',
        },
    });
});

test('requires note identifiers and text content', () => {
    assert.deepEqual(parseNoteProjectId(null), { error: 'Project ID is required' });
    assert.deepEqual(parseNoteId(''), { error: 'Note ID is required' });
    assert.deepEqual(parseCreateNote({ project_id: 'project-1', content: '  ' }), {
        error: 'Project ID and content are required',
    });
});
