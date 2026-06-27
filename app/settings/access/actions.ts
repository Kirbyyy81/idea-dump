'use server';

import {
    canAccessModule,
    getDisplayName,
    getManagedAppModules,
    getRoleModuleAssignments,
    getSessionUserAppAccess,
    getUserAppAccess,
} from '@/lib/rbac/access';
import { AppModuleSlug } from '@/lib/rbac/constants';
import { AccessAdminRoleRecord, AccessAdminUserRecord, AppModuleMetadata, ModuleOverrideEffect } from '@/lib/rbac/types';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AccessUsersResponse {
    modules: AppModuleMetadata[];
    roleAssignments: AccessAdminRoleRecord[];
    roles: string[];
    users: AccessAdminUserRecord[];
}

async function requireAccessAdmin() {
    const session = await getSessionUserAppAccess();
    if (!session) {
        throw new Error('Authentication required');
    }

    if (!canAccessModule(session.access, 'access_control') || !session.access.canManageAccess) {
        throw new Error('You do not have access to this module');
    }

    return session;
}

export async function getAccessAdminData(): Promise<AccessUsersResponse> {
    await requireAccessAdmin();

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
    });

    if (error) {
        throw new Error(error.message || 'Failed to load users');
    }

    const [modules, roleAssignments, roleRows, users] = await Promise.all([
        getManagedAppModules(),
        getRoleModuleAssignments(),
        admin.from('DIM_roles').select('role').order('role', { ascending: true }),
        Promise.all(
            data.users.map(async (user) => {
                const access = await getUserAppAccess(user.id);

                return {
                    allowedModules: access.allowedModules,
                    displayName: getDisplayName(user),
                    email: user.email ?? null,
                    id: user.id,
                    overrides: access.overrides,
                    role: access.role,
                } satisfies AccessAdminUserRecord;
            })
        ),
    ]);

    if (roleRows.error) {
        throw new Error(roleRows.error.message || 'Failed to load roles');
    }

    const orderedRoles = [
        ...(roleRows.data || []).map((row) => row.role).filter((role) => role === 'owner' || role === 'admin' || role === 'member'),
        ...(roleRows.data || []).map((row) => row.role).filter((role) => role !== 'owner' && role !== 'admin' && role !== 'member'),
    ];

    return {
        modules,
        roleAssignments: roleAssignments satisfies AccessAdminRoleRecord[],
        roles: orderedRoles,
        users,
    };
}

export async function saveRoleModules(role: string, modules: string[]): Promise<{ success: true }> {
    await requireAccessAdmin();

    const roleSlug = role.trim();
    const rawModules = modules || [];
    const requestedModules = Array.from(new Set(rawModules));
    const managedModules = await getManagedAppModules();
    const managedModuleSlugs = new Set<AppModuleSlug>(managedModules.map((moduleRow) => moduleRow.slug));

    if (!roleSlug) {
        throw new Error('Invalid role');
    }

    if (rawModules.some((moduleSlug) => !managedModuleSlugs.has(moduleSlug as AppModuleSlug))) {
        throw new Error('Invalid module selection');
    }

    const admin = createAdminClient();

    const { data: roleRow, error: roleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .single();

    if (roleError || !roleRow) {
        throw new Error('Invalid role');
    }

    let moduleRows: Array<{ id: string; modules: AppModuleSlug }> = [];

    if (requestedModules.length > 0) {
        const { data, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', requestedModules);

        if (moduleError) {
            throw new Error(moduleError.message || 'Failed to update role modules');
        }

        moduleRows = ((data || []) as Array<{ id: string; modules: string }>).filter(
            (moduleRow): moduleRow is { id: string; modules: AppModuleSlug } =>
                managedModuleSlugs.has(moduleRow.modules as AppModuleSlug)
        );

        if (moduleRows.length !== requestedModules.length) {
            throw new Error('Invalid module selection');
        }

        const { error: upsertError } = await admin.from('BRIDGE_role_modules').upsert(
            moduleRows.map((moduleRow) => ({
                module_id: moduleRow.id,
                role_id: roleRow.id,
            })),
            { onConflict: 'role_id,module_id' }
        );

        if (upsertError) {
            throw new Error(upsertError.message || 'Failed to update role modules');
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
        throw new Error(deleteError.message || 'Failed to update role modules');
    }

    return { success: true };
}

export async function createRole(role: string, modules: string[]): Promise<{ success: true }> {
    await requireAccessAdmin();

    const roleSlug = role
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_ -]/g, '')
        .replace(/\s+/g, '_');
    const rawModules = modules || [];
    const requestedModules = Array.from(new Set(rawModules));
    const managedModules = await getManagedAppModules();
    const managedModuleSlugs = new Set<AppModuleSlug>(managedModules.map((moduleRow) => moduleRow.slug));

    if (!roleSlug) {
        throw new Error('Role name is required');
    }

    if (!/^[a-z0-9_ -]+$/.test(roleSlug) || roleSlug.length > 40) {
        throw new Error('Role name is invalid');
    }

    if (rawModules.some((moduleSlug) => !managedModuleSlugs.has(moduleSlug as AppModuleSlug))) {
        throw new Error('Invalid module selection');
    }

    const admin = createAdminClient();
    const { data: existingRole, error: existingRoleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .maybeSingle();

    if (existingRoleError) {
        throw new Error(existingRoleError.message || 'Failed to create role');
    }

    if (existingRole) {
        throw new Error('Role already exists');
    }

    const { data: createdRole, error: createRoleError } = await admin
        .from('DIM_roles')
        .insert({ role: roleSlug, name: roleSlug.replace(/_/g, ' ') })
        .select('id, role')
        .single();

    if (createRoleError || !createdRole) {
        throw new Error(createRoleError?.message || 'Role creation failed');
    }

    if (requestedModules.length > 0) {
        const { data: moduleRows, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', requestedModules);

        if (moduleError) {
            throw new Error(moduleError.message || 'Failed to create role');
        }

        if ((moduleRows || []).length !== requestedModules.length) {
            throw new Error('Invalid module selection');
        }

        const { error: insertError } = await admin.from('BRIDGE_role_modules').insert(
            (moduleRows || []).map((moduleRow) => ({
                module_id: moduleRow.id,
                role_id: createdRole.id,
            }))
        );

        if (insertError) {
            throw new Error(insertError.message || 'Failed to create role');
        }
    }

    return { success: true };
}

export async function saveUserAccess(
    userId: string,
    role: string,
    overrides: Record<string, ModuleOverrideEffect | null>
): Promise<{ success: true }> {
    await requireAccessAdmin();

    const admin = createAdminClient();
    const roleSlug = role?.trim();
    const overrideEntries = Object.entries(overrides ?? {});
    const managedModules = await getManagedAppModules();
    const managedModuleSlugs = new Set<AppModuleSlug>(managedModules.map((moduleRow) => moduleRow.slug));

    if (!roleSlug) {
        throw new Error('Invalid role');
    }

    const hasInvalidOverride = overrideEntries.some(
        ([moduleSlug, effect]) =>
            !managedModuleSlugs.has(moduleSlug as AppModuleSlug) ||
            (effect !== 'allow' && effect !== 'deny' && effect !== null)
    );

    if (hasInvalidOverride) {
        throw new Error('Invalid module override');
    }

    const { data: roleRow, error: roleError } = await admin
        .from('DIM_roles')
        .select('id')
        .eq('role', roleSlug)
        .single();

    if (roleError || !roleRow) {
        throw new Error('Invalid role');
    }

    const overrideModuleSlugs = Array.from(new Set(overrideEntries.map(([moduleSlug]) => moduleSlug)));
    const moduleRowsBySlug = new Map<AppModuleSlug, string>();

    if (overrideModuleSlugs.length > 0) {
        const { data: moduleRows, error: moduleError } = await admin
            .from('DIM_modules')
            .select('id, modules')
            .in('modules', overrideModuleSlugs);

        if (moduleError) {
            throw new Error(moduleError.message || 'Failed to load modules');
        }

        for (const moduleRow of (moduleRows || []) as Array<{ id: string; modules: string }>) {
            if (managedModuleSlugs.has(moduleRow.modules as AppModuleSlug)) {
                moduleRowsBySlug.set(moduleRow.modules as AppModuleSlug, moduleRow.id);
            }
        }

        if (moduleRowsBySlug.size !== overrideModuleSlugs.length) {
            throw new Error('Invalid module override');
        }
    }

    const { error: upsertRoleError } = await admin
        .from('BRIDGE_user_roles')
        .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id' });

    if (upsertRoleError) {
        throw new Error(upsertRoleError.message || 'Failed to update role');
    }

    for (const [moduleSlug, effect] of overrideEntries) {
        if (!managedModuleSlugs.has(moduleSlug as AppModuleSlug)) continue;
        const moduleId = moduleRowsBySlug.get(moduleSlug as AppModuleSlug);
        if (!moduleId) continue;

        if (effect === null) {
            const { error: deleteError } = await admin
                .from('app_user_module_overrides')
                .delete()
                .eq('user_id', userId)
                .eq('module_id', moduleId);

            if (deleteError) {
                throw new Error(deleteError.message || 'Failed to remove override');
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
            throw new Error(upsertOverrideError.message || 'Failed to save override');
        }
    }

    return { success: true };
}
