import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { parseApiKeyId, parseApiKeyName, readApiKeyRequestBody } from '@/lib/auth/apiKeySchemas';
import {
    createApiKeyForUser,
    listApiKeysForUser,
    revokeApiKeyForUser,
} from '@/lib/auth/apiKeyService';

// GET /api/keys - List all API keys for current user
export async function GET() {
    try {
        const session = await authorizeSessionModule('logs');
        if ('response' in session) {
            return session.response;
        }

        return NextResponse.json({ data: await listApiKeysForUser(session.user.id) });
    } catch (error) {
        console.error('Error fetching API keys:', error);
        return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }
}

// POST /api/keys - Create a new API key
export async function POST(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('logs');
        if ('response' in session) {
            return session.response;
        }

        const body = await readApiKeyRequestBody(request);
        if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
        const name = parseApiKeyName(body.data);
        if ('error' in name) return NextResponse.json({ error: name.error }, { status: 400 });

        return NextResponse.json(
            { data: await createApiKeyForUser(session.user.id, name.data) },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating API key:', error);
        return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }
}

// DELETE /api/keys?id=xxx - Revoke an API key without removing its audit record
export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeSessionModule('logs');
        if ('response' in session) {
            return session.response;
        }

        const id = parseApiKeyId(new URL(request.url).searchParams.get('id'));
        if ('error' in id) return NextResponse.json({ error: id.error }, { status: 400 });

        if (!await revokeApiKeyForUser(session.user.id, id.data)) {
            return NextResponse.json({ error: 'API key not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error revoking API key:', error);
        return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }
}
