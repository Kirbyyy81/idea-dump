import { NextRequest, NextResponse } from 'next/server';
import {
    canAccessModule,
    getSessionUserAppAccess,
    isManagedModuleSlug,
} from '@/lib/rbac/access';
import { AppModuleSlug } from '@/lib/rbac/constants';
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

    if (
        !canAccessModule(session.access, 'access_control') ||
        !session.access.canManageAccess
    ) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'You do not have access to this module' },
            { status: 403 }
        );
    }

    const { userId } = await params;
    const body = (await request.json()) as UpdateAccessBody;
    const admin = createAdminClient();
    const roleSlug = body.role?.trim();
    const overrides = body.overrides ?? {};
    const overrideEntries = Object.entries(overrides);

    if (!roleSlug) {
        return NextResponse.json({ error: 'Validation error', message: 'Invalid role' }, { status: 400 });
    }

    const hasInvalidOverride = overrideEntries.some(
        ([moduleSlug, effect]) =>
            !isManagedModuleSlug(moduleSlug) ||
            (effect !== 'allow' && effect !== 'deny' && effect !== null)
    );

    if (hasInvalidOverride) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Invalid module override' },
            { status: 400 }
        );
    }

    const { data: roleRow, error: roleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .single();

    if (roleError || !roleRow) {
        return NextResponse.json({ error: 'Validation error', message: 'Invalid role' }, { status: 400 });
    }

    const overrideModuleSlugs = Array.from(new Set(overrideEntries.map(([moduleSlug]) => moduleSlug)));
    const moduleRowsBySlug = new Map<AppModuleSlug, string>();

    if (overrideModuleSlugs.length > 0) {
        const { data: moduleRows, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', overrideModuleSlugs);

        if (moduleError) {
            return NextResponse.json(
                { error: 'Failed to load modules', message: moduleError.message },
                { status: 500 }
            );
        }

        for (const moduleRow of (moduleRows || []) as Array<{ id: string; modules: string }>) {
            if (isManagedModuleSlug(moduleRow.modules)) {
                moduleRowsBySlug.set(moduleRow.modules, moduleRow.id);
            }
        }

        if (moduleRowsBySlug.size !== overrideModuleSlugs.length) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Invalid module override' },
                { status: 400 }
            );
        }
    }

    const { error: upsertRoleError } = await admin
        .from('BRIDGE_user_roles')
        .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id' });

    if (upsertRoleError) {
        return NextResponse.json({ error: 'Failed to update role', message: upsertRoleError.message }, { status: 500 });
    }

    for (const [moduleSlug, effect] of overrideEntries) {
        if (!isManagedModuleSlug(moduleSlug)) continue;
        const moduleId = moduleRowsBySlug.get(moduleSlug);
        if (!moduleId) continue;

        if (effect === null) {
            const { error: deleteError } = await admin
                .from('app_user_module_overrides')
                .delete()
                .eq('user_id', userId)
                .eq('module_id', moduleId);

            if (deleteError) {
                return NextResponse.json({ error: 'Failed to remove override', message: deleteError.message }, { status: 500 });
            }
            continue;
        }

        const { error: upsertOverrideError } = await admin
            .from('app_user_module_overrides')
            .upsert(
                { effect, module_id: moduleId, user_id: userId },
                { onConflict: 'user_id,module_id' }
            );

        if (upsertOverrideError) {
            return NextResponse.json({ error: 'Failed to save override', message: upsertOverrideError.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true });
}
