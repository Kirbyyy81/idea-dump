import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type IdentityRole = 'admin' | 'agent';

export interface ResolvedIdentity {
    role: IdentityRole;
    user_id: string;
}

export class AuthError extends Error {
    constructor(
        message: string,
        public statusCode: number = 401
    ) {
        super(message);
        this.name = 'AuthError';
    }
}

/**
 * Unified authentication helper that supports:
 * 1. Admin session via Supabase auth cookie
 * 2. Agent access via x-api-key header
 * 
 * Returns the resolved identity or throws AuthError
 */
export async function resolveIdentity(request: NextRequest): Promise<ResolvedIdentity> {
    // 1. Check for admin session first
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        return {
            role: 'admin',
            user_id: user.id,
        };
    }

    // 2. Check for agent API key
    const apiKey = request.headers.get('x-api-key');

    if (apiKey) {
        const validApiKey = process.env.AGENT_API_KEY;
        const agentUserId = process.env.AGENT_USER_ID;

        if (!validApiKey || !agentUserId) {
            throw new AuthError('Agent authentication not configured', 500);
        }

        if (apiKey === validApiKey) {
            return {
                role: 'agent',
                user_id: agentUserId,
            };
        }

        throw new AuthError('Invalid API key', 401);
    }

    // 3. No valid authentication found
    throw new AuthError('Authentication required', 401);
}

/**
 * Helper to check if identity can perform an action
 */
export function canModifyLog(
    identity: ResolvedIdentity,
    logSource: 'agent' | 'human',
    allowHumanOverwrite: boolean = false
): boolean {
    // Admin can modify anything
    if (identity.role === 'admin') {
        return true;
    }

    // Agent can modify agent-created logs
    if (logSource === 'agent') {
        return true;
    }

    // Agent can only modify human logs if explicitly allowed
    return allowHumanOverwrite;
}

/**
 * Helper to check if identity can delete a log
 */
export function canDeleteLog(identity: ResolvedIdentity): boolean {
    return identity.role === 'admin';
}
