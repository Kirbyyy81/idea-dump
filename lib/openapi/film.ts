export const filmOpenApiPaths = {
'/api/film/rolls': {
    get: {
        summary: 'List film rolls',
        parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'camera_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
            200: {
                description: 'List of film rolls',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { type: 'array', items: { $ref: '#/components/schemas/FilmRoll' } },
                            },
                        },
                    },
                },
            },
        },
    },
    post: {
        summary: 'Create a film roll',
        description: 'Creates one physical roll. New inventory defaults to UNUSED and processing fields may be filled later.',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        required: ['film_name', 'brand', 'format', 'iso'],
                        properties: {
                            film_name: { type: 'string' },
                            brand: { type: 'string' },
                            format: { type: 'string', enum: ['35mm', '120', 'Large Format'] },
                            film_type: { type: 'string', enum: ['NEGATIVE', 'REVERSAL', 'BW_NEGATIVE'] },
                            process_type: { type: 'string', enum: ['C41', 'E6', 'BW', 'ECN2'], nullable: true },
                            iso: { type: 'integer' },
                            frames_taken: { type: 'integer', minimum: 0 },
                            purchase_price: { type: 'number', minimum: 0 },
                            camera_id: { type: 'string', format: 'uuid', nullable: true },
                            notes: { type: 'string' },
                        },
                    },
                },
            },
        },
        responses: {
            201: { description: 'Created film roll' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
    put: {
        summary: 'Update a film roll',
        description: 'Updates roll lifecycle, film metadata, shooting, cost, and single processing-summary fields.',
        responses: {
            200: { description: 'Updated film roll' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
    delete: {
        summary: 'Delete a film roll',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
            200: { description: 'Deleted film roll' },
        },
    },
},
'/api/film/rolls/{id}/cover': {
    get: {
        summary: 'Read a private film roll cover image',
        description: 'Authenticates the current user, verifies roll ownership, and proxies the private Storage object.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
            200: { description: 'Film cover image' },
            401: { description: 'Authentication required' },
            403: { description: 'Film Journal access required' },
            404: { description: 'Film cover not found' },
        },
    },
    post: {
        summary: 'Upload a film roll cover image',
        description: 'Validates and uploads JPEG, PNG, or WebP to private Storage, then stores a same-origin proxy URL on the roll.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
            required: true,
            content: {
                'multipart/form-data': {
                    schema: {
                        type: 'object',
                        required: ['cover'],
                        properties: {
                            cover: { type: 'string', format: 'binary' },
                        },
                    },
                },
            },
        },
        responses: {
            200: { description: 'Updated film roll with private cover proxy URL' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Film roll not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
'/api/film/cameras': {
    get: {
        summary: 'List film cameras',
        responses: {
            200: {
                description: 'List of film cameras',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { type: 'array', items: { $ref: '#/components/schemas/FilmCamera' } },
                            },
                        },
                    },
                },
            },
        },
    },
    post: {
        summary: 'Create a film camera',
        responses: {
            201: { description: 'Created film camera' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
'/api/film/dashboard': {
    get: {
        summary: 'Film journal dashboard summary',
        responses: {
            200: {
                description: 'Film summary metrics',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: { $ref: '#/components/schemas/FilmDashboard' },
                            },
                        },
                    },
                },
            },
        },
    },
},
'/api/film/integrations/google/sync': {
    post: {
        summary: 'Sync Google Drive folder image metadata for a film roll',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        required: ['film_roll_id', 'folder'],
                        properties: {
                            film_roll_id: { type: 'string', format: 'uuid' },
                            folder: { type: 'string', description: 'Google Drive folder URL or ID' },
                        },
                    },
                },
            },
        },
        responses: {
            200: { description: 'Synced Drive metadata' },
            400: { description: 'Validation or Drive connection error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
};
