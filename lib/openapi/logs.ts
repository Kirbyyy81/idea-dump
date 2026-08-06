export const logOpenApiPaths = {
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
        description:
            'Creates a human log for the current session user or an agent log for the user that owns the provided x-api-key.',
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
};
