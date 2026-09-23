const sessionErrors = {
    401: { description: 'Authentication required' },
    403: { description: 'Documentation module access required' },
    502: { description: 'Notion unavailable' },
};

export const documentationOpenApiPaths = {
    '/api/documentation': {
        get: {
            summary: 'List current Notion documents',
            description: 'Session access to the configured Document Hub. The cursor is a Notion pagination cursor.',
            parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
            responses: { 200: { description: 'Document metadata and next cursor' }, ...sessionErrors },
        },
    },
    '/api/documentation/{pageId}': {
        get: {
            summary: 'Get current document metadata',
            parameters: [{ name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
            responses: { 200: { description: 'Document metadata' }, 404: { description: 'Outside Document Hub or not found' }, ...sessionErrors },
        },
    },
    '/api/documentation/{pageId}/content': {
        get: {
            summary: 'Read a page of document blocks',
            parameters: [
                { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                { name: 'parentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                { name: 'cursor', in: 'query', schema: { type: 'string' } },
            ],
            responses: { 200: { description: 'Normalized blocks and next cursor' }, 404: { description: 'Block outside current document' }, ...sessionErrors },
        },
    },
    '/api/documentation/{pageId}/assets/{blockId}': {
        get: {
            summary: 'Read a private document asset',
            parameters: [
                { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                { name: 'blockId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            ],
            responses: { 200: { description: 'Private image or attachment bytes' }, 404: { description: 'Asset outside current document' }, ...sessionErrors },
        },
    },
};
