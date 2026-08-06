import { openApiComponents } from './components';
import { filmOpenApiPaths } from './film';
import { logOpenApiPaths } from './logs';
import { projectOpenApiPaths } from './projects';
import { ticketOpenApiPaths } from './tickets';

export function getOpenApiSpec() {
    return {
        openapi: '3.0.3',
        info: {
            title: 'IdeaDump API',
            version: '0.1.0',
            description:
                'Internal API for the IdeaDump Next.js app. Auth is either Supabase session cookies (admin) or x-api-key (agent) depending on endpoint.',
        },
        servers: [{ url: '/' }],
        components: openApiComponents,
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
            ...logOpenApiPaths,
            ...projectOpenApiPaths,
            ...ticketOpenApiPaths,
            ...filmOpenApiPaths,
        },
    };
}