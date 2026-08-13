import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '@/lib/openapi';

const root = path.resolve(import.meta.dirname, '..');

describe('OpenAPI composition', () => {
    it('composes the documented API paths from domain-owned modules', () => {
        const spec = getOpenApiSpec();

        expect(Object.keys(spec.paths)).toEqual([
            '/api/openapi',
            '/api/logs',
            '/api/logs/{id}',
            '/api/export/weekly',
            '/api/ingest',
            '/api/tickets',
            '/api/tickets/{id}',
            '/api/film/rolls',
            '/api/film/rolls/{id}/cover',
            '/api/film/cameras',
            '/api/film/dashboard',
            '/api/film/integrations/google/sync',
        ]);
        expect(spec.components.schemas.Ticket.properties.status.type).toBe('string');
        expect(spec.paths['/api/film/rolls'].post.summary).toBe('Create a film roll');
    });

    it('keeps endpoint definitions out of the OpenAPI composition entry point', () => {
        const index = fs.readFileSync(path.join(root, 'lib', 'openapi', 'index.ts'), 'utf8');

        expect(index).toMatch(/from '\.\/logs'/);
        expect(index).toMatch(/from '\.\/projects'/);
        expect(index).toMatch(/from '\.\/tickets'/);
        expect(index).toMatch(/from '\.\/film'/);
        expect(index).not.toMatch(/'\/api\/logs'/);
    });
});
