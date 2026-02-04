import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// Generate a secure random API key
function generateApiKey(): string {
    return 'id_' + crypto.randomBytes(32).toString('hex');
}

// Hash an API key for storage
function hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

// GET /api/keys - List all API keys for current user
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('api_keys')
            .select('id, name, created_at, last_used_at')
            .eq('user_id', user.id)
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
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
        }

        // Generate new API key
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);

        const { data, error } = await supabase
            .from('api_keys')
            .insert({
                user_id: user.id,
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

// DELETE /api/keys?id=xxx - Delete an API key
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('api_keys')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting API key:', error);
        return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }
}
