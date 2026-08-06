const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseCreateProject,
    parseProjectIngest,
    parseUpdateProject,
} = require('../lib/projects/core/schemas.ts');

test('normalizes a project creation request', () => {
    assert.deepEqual(parseCreateProject({
        title: ' Project ',
        description: ' Details ',
        priority: 'high',
    }), {
        data: {
            title: 'Project',
            description: 'Details',
            prd_content: null,
            github_url: null,
            deploy_url: null,
            priority: 'high',
        },
    });
});

test('validates project updates and ingest payloads', () => {
    assert.deepEqual(parseUpdateProject({ id: 'project-1', completed: true }), {
        id: 'project-1',
        data: { completed: true },
    });
    assert.deepEqual(parseProjectIngest({
        title: 'Imported',
        tags: [' ai ', '', 'web'],
    }), {
        data: {
            title: 'Imported',
            description: null,
            prd_content: null,
            tags: ['ai', 'web'],
        },
    });
    assert.deepEqual(parseProjectIngest({ title: 'Imported', tags: ['ok', 3] }), {
        error: 'tags must be an array of strings',
    });
});
