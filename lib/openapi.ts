import { DailyLogContent } from '@/lib/types';

export function getOpenApiSpec() {
    const dailyLogContentSchema = {
        type: 'object',
        required: ['date'],
        properties: {
            date: { type: 'string', format: 'date', example: '2026-03-16' },
            day: { type: 'string', example: 'Monday' },
            operation_task: { type: 'string', example: 'Shipped weekly log filters' },
            tools_used: { type: 'string', example: 'Next.js, Supabase' },
            lesson_learned: { type: 'string', example: 'Normalize content types at boundaries' },
        },
        additionalProperties: true,
    };

    const dailyLogEntrySchema = {
        type: 'object',
        required: ['id', 'user_id', 'source', 'content', 'effective_date', 'created_at', 'updated_at'],
        properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            source: { type: 'string', enum: ['agent', 'human'] },
            content: dailyLogContentSchema,
            effective_date: { type: 'string', format: 'date' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
        },
    };

    const errorSchema = {
        type: 'object',
        properties: {
            error: { type: 'string' },
            message: { type: 'string' },
        },
    };

    return {
        openapi: '3.0.3',
        info: {
            title: 'IdeaDump API',
            version: '0.1.0',
            description:
                'Internal API for the IdeaDump Next.js app. Auth is either Supabase session cookies (admin) or x-api-key (agent) depending on endpoint.',
        },
        servers: [{ url: '/' }],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'Agent authentication header for select endpoints.',
                },
            },
            schemas: {
                DailyLogContent: dailyLogContentSchema,
                DailyLogEntry: dailyLogEntrySchema,
                Error: errorSchema,
            },
        },
        paths: {
            '/api/openapi': {
                get: {
                    summary: 'OpenAPI spec',
                    responses: {
                        200: {
                            description: 'OpenAPI document',
                        },
                    },
                },
            },
            '/api/logs': {
                get: {
                    summary: 'List log entries',
                    description:
                        'Lists daily log entries for the resolved identity. Supports date filters and basic cursor pagination.',
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
                        { name: 'cursor', in: 'query', schema: { type: 'string', format: 'date-time' } },
                        { name: 'sort', in: 'query', schema: { type: 'string', example: 'created_at.desc' } },
                    ],
                    responses: {
                        200: {
                            description: 'A page of logs',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            data: { type: 'array', items: { $ref: '#/components/schemas/DailyLogEntry' } },
                                            next_cursor: { type: ['string', 'null'] },
                                        },
                                    },
                                },
                            },
                        },
                        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
                post: {
                    summary: 'Create a log entry',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['content'],
                                    properties: {
                                        content: { $ref: '#/components/schemas/DailyLogContent' },
                                        effective_date: { type: 'string', format: 'date' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        201: {
                            description: 'Created log',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            data: { $ref: '#/components/schemas/DailyLogEntry' },
                                        },
                                    },
                                },
                            },
                        },
                        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/api/logs/{id}': {
                patch: {
                    summary: 'Update a log entry',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['content'],
                                    properties: {
                                        content: { $ref: '#/components/schemas/DailyLogContent' },
                                        allow_human_overwrite: { type: 'boolean' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Updated log',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { data: { $ref: '#/components/schemas/DailyLogEntry' } },
                                    },
                                },
                            },
                        },
                        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
                delete: {
                    summary: 'Delete a log entry (admin only)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        204: { description: 'Deleted' },
                        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/api/export/weekly': {
                post: {
                    summary: 'Export weekly logs as markdown',
                    description: 'Admin-only endpoint that returns a markdown table for the requested date range.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['from', 'to'],
                                    properties: {
                                        from: { type: 'string', format: 'date' },
                                        to: { type: 'string', format: 'date' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Markdown export',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { markdown: { type: 'string' } },
                                    },
                                },
                            },
                        },
                        401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/api/ingest': {
                get: {
                    summary: 'Ingest API documentation (legacy)',
                    responses: { 200: { description: 'JSON doc' } },
                },
                post: {
                    summary: 'Create a project via API key',
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['title'],
                                    properties: {
                                        title: { type: 'string' },
                                        description: { type: 'string' },
                                        prd_content: { type: 'string' },
                                        tags: { type: 'array', items: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Created' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' },
                    },
                },
            },
        },
    };
}

// Keep TS from tree-shaking away unused type imports in some setups
void (0 as unknown as DailyLogContent);

