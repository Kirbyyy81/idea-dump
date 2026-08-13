import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, requestApi } from '@/lib/api/client';
import { isApiErrorResponse } from '@/lib/api/contracts';

describe('shared API contract', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('recognizes the shared API error envelope', () => {
        expect(isApiErrorResponse({
            error: 'VALIDATION_ERROR',
            message: 'Check the submitted fields',
            field_errors: { title: 'Title is required' },
        })).toBe(true);
        expect(isApiErrorResponse({ error: 'Title is required' })).toBe(false);
    });

    it('unwraps shared data responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ data: { id: 'project-1' } }),
            { status: 200 }
        )));

        await expect(requestApi('/api/projects')).resolves.toEqual({ id: 'project-1' });
    });

    it('preserves typed API errors for browser clients', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Title is required',
            field_errors: { title: 'Title is required' },
        }), { status: 400 })));

        await expect(requestApi('/api/projects')).rejects.toMatchObject({
            code: 'VALIDATION_ERROR',
            status: 400,
            fieldErrors: { title: 'Title is required' },
        });

        try {
            await requestApi('/api/projects');
        } catch (error) {
            expect(error).toBeInstanceOf(ApiClientError);
        }
    });
});
