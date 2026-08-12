export const ticketOpenApiPaths = {
'/api/tickets': {
    get: {
        summary: 'List tickets',
        parameters: [
            { name: 'project_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'priority', in: 'query', schema: { type: 'string' } },
            { name: 'source', in: 'query', schema: { type: 'string' } },
            { name: 'scope', in: 'query', schema: { type: 'string', enum: ['mine', 'manage'] } },
        ],
        responses: {
            200: {
                description: 'List of tickets',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { type: 'array', items: { $ref: '#/components/schemas/Ticket' } },
                            },
                        },
                    },
                },
            },
            403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
    post: {
        summary: 'Create a ticket',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        required: ['project_id', 'title'],
                        properties: {
                            project_id: { type: 'string', format: 'uuid' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            notes: { type: 'string' },
                            status: { type: 'string', enum: ['todo', 'in_progress', 'to_review', 'done', 'closed'] },
                            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                            source: { type: 'string', enum: ['self', 'user_tester'] },
                            tags: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
            },
        },
        responses: {
            201: {
                description: 'Created ticket',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { $ref: '#/components/schemas/Ticket' },
                            },
                        },
                    },
                },
            },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
'/api/tickets/{id}': {
    patch: {
        summary: 'Update a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
            200: {
                description: 'Updated ticket',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { $ref: '#/components/schemas/Ticket' },
                            },
                        },
                    },
                },
            },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
    delete: {
        summary: 'Delete a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
            200: { description: 'Deleted' },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
};
