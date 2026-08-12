export const projectOpenApiPaths = {
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
};
