import { NextRequest, NextResponse } from 'next/server';
import {
    canAccessModule,
    getManagedAppModules,
    getSessionUserAppAccess,
} from '@/lib/rbac/access';
import { AppModuleSlug } from '@/lib/rbac/constants';
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
        !session.access.canManageAccess
    ) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'You do not have access to this module' },
            { status: 403 }
        );
    }

    const { role } = await params;
    const roleSlug = role.trim();
    const body = (await request.json()) as UpdateRoleModulesBody;
    const rawModules = body.modules || [];
    const requestedModules = Array.from(new Set(rawModules));
    const managedModules = await getManagedAppModules();
    const managedModuleSlugs = new Set<AppModuleSlug>(managedModules.map((moduleRow) => moduleRow.slug));

    if (!roleSlug) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Invalid role' },
            { status: 400 }
        );
    }

    if (rawModules.some((moduleSlug) => !managedModuleSlugs.has(moduleSlug as AppModuleSlug))) {
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

    let moduleRows: Array<{ id: string; modules: AppModuleSlug }> = [];

    if (requestedModules.length > 0) {
        const { data, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', requestedModules);

        if (moduleError) {
            return NextResponse.json(
                { error: 'Failed to update role modules', message: moduleError.message },
                { status: 500 }
            );
        }

        moduleRows = ((data || []) as Array<{ id: string; modules: string }>).filter(
            (moduleRow): moduleRow is { id: string; modules: AppModuleSlug } =>
                managedModuleSlugs.has(moduleRow.modules as AppModuleSlug)
        );

        if (moduleRows.length !== requestedModules.length) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Invalid module selection' },
                { status: 400 }
            );
        }

        const { error: upsertError } = await admin.from('BRIDGE_role_modules').upsert(
            moduleRows.map((moduleRow) => ({
                module_id: moduleRow.id,
                role_id: roleRow.id,
            })),
            { onConflict: 'role_id,module_id' }
        );

        if (upsertError) {
            return NextResponse.json(
                { error: 'Failed to update role modules', message: upsertError.message },
                { status: 500 }
            );
        }
    }

    const requestedModuleIds = moduleRows.map((moduleRow) => moduleRow.id);
    const deleteQuery = admin
        .from('BRIDGE_role_modules')
        .delete()
        .eq('role_id', roleRow.id);
    const { error: deleteError } = requestedModuleIds.length > 0
        ? await deleteQuery.not('module_id', 'in', `(${requestedModuleIds.join(',')})`)
        : await deleteQuery;

    if (deleteError) {
        return NextResponse.json(
            { error: 'Failed to update role modules', message: deleteError.message },
            { status: 500 }
        );
    }

    const { data: persistedRows, error: persistedError } = await admin
        .from('BRIDGE_role_modules')
        .select('DIM_modules!inner(modules)')
        .eq('role_id', roleRow.id);

    if (persistedError) {
        return NextResponse.json(
            { error: 'Failed to load role modules', message: persistedError.message },
            { status: 500 }
        );
    }

    const persistedModules = ((persistedRows || []) as Array<{ DIM_modules: { modules: string } | { modules: string }[] | null }>)
        .map((row) => {
            const moduleRecord = Array.isArray(row.DIM_modules) ? row.DIM_modules[0] : row.DIM_modules;
            return moduleRecord?.modules;
        })
        .filter((moduleSlug): moduleSlug is AppModuleSlug => managedModuleSlugs.has(moduleSlug as AppModuleSlug));

    return NextResponse.json({
        data: {
            modules: managedModules.map((moduleRow) => moduleRow.slug).filter((moduleSlug) => persistedModules.includes(moduleSlug)),
            role: roleSlug,
        },
        success: true,
    });
}
