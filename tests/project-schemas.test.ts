import { describe, expect, it } from 'vitest';
import {
    parseCreateProject,
    parseProjectIngest,
    parseUpdateProject,
} from '@/lib/projects/core/schemas';

describe('project schemas', () => {
    it('normalizes a project creation request', () => {
        expect(parseCreateProject({
            title: ' Project ',
            description: ' Details ',
            priority: 'high',
        })).toEqual({
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

    it('validates project updates and ingest payloads', () => {
        expect(parseUpdateProject({ id: 'project-1', completed: true })).toEqual({
            id: 'project-1',
            data: { completed: true },
        });
        expect(parseProjectIngest({
            title: 'Imported',
            tags: [' ai ', '', 'web'],
        })).toEqual({
            data: {
                title: 'Imported',
                description: null,
                prd_content: null,
                tags: ['ai', 'web'],
            },
        });
        expect(parseProjectIngest({ title: 'Imported', tags: ['ok', 3] })).toEqual({
            error: {
                message: 'tags must be an array of strings',
                fieldErrors: { tags: 'tags must be an array of strings' },
            },
        });
    });

    it('returns field errors for invalid project form values', () => {
        expect(parseCreateProject({ title: '', priority: 'urgent' })).toEqual({
            error: {
                message: 'Title is required',
                fieldErrors: { title: 'Title is required' },
            },
        });
    });
});
