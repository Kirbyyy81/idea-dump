import { NextRequest, NextResponse } from 'next/server';
import { consumeActiveApiKey } from '@/lib/auth/apiKeys';
import { canAccessModule, getUserAppAccess } from '@/lib/rbac/access';
import { authorizeSessionModule, createForbiddenModuleResponse } from '@/lib/rbac/guards';
import { createIngestedProject } from '@/lib/projects/repository';
import { parseProjectIngest, readProjectRequestBody } from '@/lib/projects/schemas';

// POST /api/ingest - External API for ingesting projects
// Headers: { "x-api-key": "your-api-key" }
export async function POST(request: NextRequest) {
    try {
        // Get API key from header
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return NextResponse.json(
                { error: 'API key required. Include x-api-key header.' },
                { status: 401 }
            );
        }

        const keyData = await consumeActiveApiKey(apiKey);
        if (!keyData) {
            return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
        }

        const access = await getUserAppAccess(keyData.userId);
        if (!canAccessModule(access, 'projects')) {
            return createForbiddenModuleResponse();
        }

        const rawBody = await readProjectRequestBody(request);
        if ('error' in rawBody) {
            return NextResponse.json({ error: rawBody.error }, { status: 400 });
        }

        const input = parseProjectIngest(rawBody.data);
        if ('error' in input) {
            return NextResponse.json({ error: input.error }, { status: 400 });
        }

        const project = await createIngestedProject(keyData.userId, input.data);

        return NextResponse.json(
            {
                success: true,
                message: 'Project created successfully',
                project
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error in ingest API:', error);
        return NextResponse.json({ error: 'Failed to ingest project' }, { status: 500 });
    }
}

// GET /api/ingest - API documentation
export async function GET() {
    const access = await authorizeSessionModule('settings');
    if ('response' in access) {
        return access.response;
    }

    return NextResponse.json({
        name: 'IdeaDump Ingest API',
        version: '1.0',
        endpoints: {
            'POST /api/ingest': {
                description: 'Create a new project from external tools',
                headers: {
                    'x-api-key': 'Your API key (required)',
                    'Content-Type': 'application/json',
                },
                body: {
                    title: 'string (required)',
                    description: 'string (optional)',
                    prd_content: 'string - markdown content (optional)',
                    tags: 'string[] (optional)',
                },
                example: {
                    title: 'My New Project',
                    description: 'A brief description',
                    prd_content: '# PRD Content\n\nMarkdown here...',
                    tags: ['ai', 'web'],
                },
            },
        },
    });
}
