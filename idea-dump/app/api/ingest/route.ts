import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

        // Use service role to verify API key
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { cookies: { get: () => undefined, set: () => { }, remove: () => { } } }
        );

        // Hash the API key and look it up
        const crypto = await import('crypto');
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

        const { data: keyData, error: keyError } = await supabase
            .from('api_keys')
            .select('user_id')
            .eq('key_hash', keyHash)
            .single();

        if (keyError || !keyData) {
            return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
        }

        // Update last_used_at
        await supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('key_hash', keyHash);

        // Parse request body
        // Parse request body
        const body = await request.json();
        const { title, description, prd_content } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Create the project
        const { data, error } = await supabase
            .from('projects')
            .insert({
                user_id: keyData.user_id,
                title,
                description: description || null,
                prd_content: prd_content || null,
                priority: 'medium',
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(
            {
                success: true,
                message: 'Project created successfully',
                project: { id: data.id, title: data.title }
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
                },
                example: {
                    title: 'My New Project',
                    description: 'A brief description',
                    prd_content: '# PRD Content\n\nMarkdown here...',
                },
            },
        },
    });
}
