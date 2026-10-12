function filmJsonResponse(description: string, schema: string, array = false) {
    const item = { $ref: `#/components/schemas/${schema}` };
    return { description, content: { 'application/json': { schema: {
        type: 'object', properties: { data: array ? { type: 'array', items: item } : item },
    } } } };
}

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
                                data: { type: 'array', items: { $ref: '#/components/schemas/FilmRollSummary' } },
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
            201: filmJsonResponse('Created film roll', 'FilmRoll'),
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
    put: {
        summary: 'Update a film roll',
        description: 'Updates roll lifecycle, film metadata, shooting, cost, and single processing-summary fields.',
        responses: {
            200: filmJsonResponse('Updated film roll', 'FilmRoll'),
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
            200: filmJsonResponse('Updated film roll with private cover proxy URL', 'FilmRoll'),
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Film roll not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
'/api/film/rolls/{id}': {
    get: {
        summary: 'Get film roll details and display metadata for photos',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: filmJsonResponse('Film roll details', 'FilmRoll') },
    },
},
'/api/film/photos': {
    get: {
        summary: 'List photo display metadata',
        parameters: [{ name: 'film_roll_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: filmJsonResponse('Photo display metadata', 'FilmPhoto', true) },
    },
    put: {
        summary: 'Update a favorite or cover selection',
        responses: { 200: filmJsonResponse('Updated photo only', 'FilmPhoto') },
    },
},
'/api/film/photos/{id}/image': {
    get: {
        summary: 'Read a private Drive photo or thumbnail',
        description: 'Verifies session and photo ownership. Thumbnail requests resolve fresh Drive thumbnail links and allow private browser caching for five minutes, varying by Cookie and Authorization. Missing thumbnails return 404 without downloading the original. Omit size for the original image, which is not cached.',
        parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'size', in: 'query', schema: { type: 'string', enum: ['thumbnail'] } },
        ],
        responses: {
            200: { description: 'Image bytes using the upstream image content type' },
            400: { description: 'Invalid size' },
            401: { description: 'Authentication required' },
            403: { description: 'Film Journal access required' },
            404: { description: 'Photo or preview unavailable' },
        },
    },
},
'/api/film/maintenance': {
    get: { summary: 'List camera maintenance', responses: { 200: filmJsonResponse('Maintenance records', 'FilmMaintenance', true) } },
    post: { summary: 'Create camera maintenance', responses: { 201: filmJsonResponse('Maintenance record', 'FilmMaintenance') } },
    put: { summary: 'Update camera maintenance', responses: { 200: filmJsonResponse('Maintenance record', 'FilmMaintenance') } },
},
'/api/film/cameras': {
    put: { summary: 'Update a film camera', responses: { 200: filmJsonResponse('Updated camera', 'FilmCamera') } },
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
            201: filmJsonResponse('Created film camera', 'FilmCamera'),
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
            200: { description: 'Sync counts only. Fetch the roll once to refresh its photos and frame count.', content: { 'application/json': { schema: {
                type: 'object', properties: { data: { type: 'object', additionalProperties: false, required: ['synced_count', 'removed_count'], properties: {
                    synced_count: { type: 'integer' }, removed_count: { type: 'integer' },
                } } },
            } } } },
            400: { description: 'Validation or Drive connection error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
    },
},
};
