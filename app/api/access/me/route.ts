import { NextResponse } from 'next/server';
import { getSessionUserAppAccess } from '@/lib/rbac/access';

export async function GET() {
    const session = await getSessionUserAppAccess();

    if (!session) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Authentication required' },
            { status: 401 }
        );
    }

    return NextResponse.json({
        data: {
            allowed_modules: session.access.allowedModules,
            can_manage_access: session.access.canManageAccess,
            overrides: session.access.overrides,
            role: session.access.role,
            user_id: session.user.id,
        },
    });
}
