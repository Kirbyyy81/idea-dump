import { NextRequest, NextResponse } from 'next/server';
import { canAccessModule, getSessionUserAppAccess, isManagedModuleSlug } from '@/lib/rbac/access';
import { ACCESS_MANAGER_ROLES } from '@/lib/rbac/constants';
import { createAdminClient } from '@/lib/supabase/admin';

interface CreateRoleBody {
    modules?: string[];
    role?: string;
}

function normalizeNewRole(value?: string | null) {
    return value
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9_ -]/g, '')
        .replace(/\s+/g, '_') ?? '';
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as CreateRoleBody;
    const roleSlug = normalizeNewRole(body.role);
    const requestedModules = Array.from(new Set((body.modules || []).filter(isManagedModuleSlug)));

    if (!roleSlug) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Role name is required' },
            { status: 400 }
        );
    }

    if (!/^[a-z0-9_ -]+$/.test(roleSlug) || roleSlug.length > 40) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Role name is invalid' },
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
    const { data: existingRole, error: existingRoleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .maybeSingle();

    if (existingRoleError) {
        return NextResponse.json(
            { error: 'Failed to create role', message: existingRoleError.message },
            { status: 500 }
        );
    }

    if (existingRole) {
        return NextResponse.json(
            { error: 'Validation error', message: 'Role already exists' },
            { status: 400 }
        );
    }

    const { data: createdRole, error: createRoleError } = await admin
        .from('DIM_roles')
        .insert({ role: roleSlug, name: roleSlug.replace(/_/g, ' ') })
        .select('id, role')
        .single();

    if (createRoleError || !createdRole) {
        return NextResponse.json(
            { error: 'Failed to create role', message: createRoleError?.message || 'Role creation failed' },
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
                { error: 'Failed to create role', message: moduleError.message },
                { status: 500 }
            );
        }

        if ((moduleRows || []).length !== requestedModules.length) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Invalid module selection' },
                { status: 400 }
            );
        }

        const { error: insertError } = await admin.from('BRIDGE_role_modules').insert(
            (moduleRows || []).map((moduleRow) => ({
                module_id: moduleRow.id,
                role_id: createdRole.id,
            }))
        );

        if (insertError) {
            return NextResponse.json(
                { error: 'Failed to create role', message: insertError.message },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({
        success: true,
        data: {
            role: createdRole.role,
            modules: requestedModules,
        },
    });
}
