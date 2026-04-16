import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserAppAccess, isManagedModuleSlug, normalizeRoleSlug } from '@/lib/rbac/access';
import { ACCESS_MANAGER_ROLES } from '@/lib/rbac/constants';
import { createAdminClient } from '@/lib/supabase/admin';
import { ModuleOverrideEffect } from '@/lib/rbac/types';

interface UpdateAccessBody {
    overrides?: Record<string, ModuleOverrideEffect | null>;
    role?: string;
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const session = await getSessionUserAppAccess();
    if (!session) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Authentication required' },
            { status: 401 }
        );
    }

    if (!ACCESS_MANAGER_ROLES.includes(session.access.role)) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'You do not have access to this module' },
            { status: 403 }
        );
    }

    const { userId } = await params;
    const body = (await request.json()) as UpdateAccessBody;
    const admin = createAdminClient();
    const roleSlug = normalizeRoleSlug(body.role);

    const { data: roleRow, error: roleError } = await admin
        .from('app_roles')
        .select('id')
        .eq('slug', roleSlug)
        .single();

    if (roleError || !roleRow) {
        return NextResponse.json({ error: 'Validation error', message: 'Invalid role' }, { status: 400 });
    }

    const { error: upsertRoleError } = await admin
        .from('app_user_roles')
        .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id' });

    if (upsertRoleError) {
        return NextResponse.json({ error: 'Failed to update role', message: upsertRoleError.message }, { status: 500 });
    }

    const overrides = body.overrides ?? {};
    for (const [moduleSlug, effect] of Object.entries(overrides)) {
        if (!isManagedModuleSlug(moduleSlug)) {
            continue;
        }

        const { data: moduleRow, error: moduleError } = await admin
            .from('app_modules')
            .select('id')
            .eq('slug', moduleSlug)
            .single();

        if (moduleError || !moduleRow) {
            continue;
        }

        if (!effect) {
            const { error: deleteError } = await admin
                .from('app_user_module_overrides')
                .delete()
                .eq('user_id', userId)
                .eq('module_id', moduleRow.id);

            if (deleteError) {
                return NextResponse.json({ error: 'Failed to remove override', message: deleteError.message }, { status: 500 });
            }
            continue;
        }

        const { error: upsertOverrideError } = await admin
            .from('app_user_module_overrides')
            .upsert(
                { user_id: userId, module_id: moduleRow.id, effect },
                { onConflict: 'user_id,module_id' }
            );

        if (upsertOverrideError) {
            return NextResponse.json({ error: 'Failed to save override', message: upsertOverrideError.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true });
}
