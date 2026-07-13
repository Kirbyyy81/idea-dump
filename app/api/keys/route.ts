import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { hashApiKey } from '@/lib/auth/apiKeys';
import crypto from 'node:crypto';

// Generate a secure random API key
function generateApiKey(): string {
    return 'id_' + crypto.randomBytes(32).toString('hex');
}

// GET /api/keys - List all API keys for current user
export async function GET() {
    try {
        const session = await authorizeSessionModule('logs');
        if ('response' in session) {
            return session.response;
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('api_keys')
            .select('id, name, created_at, last_used_at')
            .eq('user_id', session.user.id)
            .is('revoked_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ data });
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

        const admin = createAdminClient();

        const body: unknown = await request.json();
        const name = typeof body === 'object' && body !== null && 'name' in body && typeof body.name === 'string'
            ? body.name.trim()
            : '';

        if (!name) {
            return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
        }

        // Generate new API key
        const apiKey = generateApiKey();

        const keyHash = hashApiKey(apiKey);

        const { data, error } = await admin
            .from('api_keys')
            .insert({
                user_id: session.user.id,
                key_hash: keyHash,
                name,
            })
            .select('id, name, created_at')
            .single();

        if (error) throw error;

        // Return the key in plain text (only shown once)
        return NextResponse.json({
            data: {
                ...data,
                key: apiKey, // Only returned on creation
            }
        }, { status: 201 });
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

        const admin = createAdminClient();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
        }

        const { data, error } = await admin
            .from('api_keys')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', session.user.id)
            .is('revoked_at', null)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json({ error: 'API key not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error revoking API key:', error);
        return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }
}
