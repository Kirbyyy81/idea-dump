import { NextRequest, NextResponse } from 'next/server';
import {
    canAccessModule,
    getSessionUserAppAccess,
    isManagedModuleSlug,
} from '@/lib/rbac/access';
import { ACCESS_MANAGER_ROLES, MANAGED_MODULE_SLUGS } from '@/lib/rbac/constants';
import { createAdminClient } from '@/lib/supabase/admin';

interface UpdateRoleModulesBody {
    modules?: string[];
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ role: string }> }
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
        !ACCESS_MANAGER_ROLES.includes(session.access.role)
    ) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'You do not have access to this module' },
            { status: 403 }
        );
    }

    const { role } = await params;
    const roleSlug = role.trim();
    const body = (await request.json()) as UpdateRoleModulesBody;
    const requestedModules = Array.from(new Set((body.modules || []).filter(isManagedModuleSlug)));

    if (!roleSlug) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Invalid role' },
            { status: 400 }
        );
    }

    if ((body.modules || []).length !== requestedModules.length) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Invalid module selection' },
            { status: 400 }
        );
    }

    const admin = createAdminClient();

    const { data: roleRow, error: roleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .single();

    if (roleError || !roleRow) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Invalid role' },
            { status: 400 }
        );
    }

    const { error: deleteError } = await admin
        .from('BRIDGE_role_modules')
        .delete()
        .eq('role_id', roleRow.id);

    if (deleteError) {
        return NextResponse.json(
            { error: 'Failed to update role modules', message: deleteError.message },
            { status: 500 }
        );
    }

    if (requestedModules.length > 0) {
        const { data: moduleRows, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', requestedModules);

        if (moduleError) {
            return NextResponse.json(
                { error: 'Failed to update role modules', message: moduleError.message },
                { status: 500 }
            );
        }

        const validModules = (moduleRows || [])
            .map((moduleRow) => moduleRow.modules)
            .filter((moduleSlug) => isManagedModuleSlug(moduleSlug));

        if (validModules.length !== requestedModules.length) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Invalid module selection' },
                { status: 400 }
            );
        }

        const { error: insertError } = await admin.from('BRIDGE_role_modules').insert(
            (moduleRows || []).map((moduleRow) => ({
                module_id: moduleRow.id,
                role_id: roleRow.id,
            }))
        );

        if (insertError) {
            return NextResponse.json(
                { error: 'Failed to update role modules', message: insertError.message },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({
        data: {
            modules: MANAGED_MODULE_SLUGS.filter((moduleSlug) => requestedModules.includes(moduleSlug)),
            role: roleSlug,
        },
        success: true,
    });
}
