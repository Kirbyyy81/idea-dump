'use server';

import {
    canAccessModule,
    getDisplayName,
    getAllAppModules,
    getManagedAppModules,
    getRoleModuleAssignments,
    getSessionUserAppAccess,
    getUserAppAccess,
    isAppModuleSlug,
} from '@/lib/rbac/access';
import { AppModuleSlug } from '@/lib/rbac/constants';
import { AccessAdminRoleRecord, AccessAdminUserRecord, AppModuleMetadata, ModuleOverrideEffect } from '@/lib/rbac/types';
import { createAdminClient } from '@/lib/supabase/admin';

const PROTECTED_MODULE_SLUGS: AppModuleSlug[] = ['dashboard', 'settings', 'access_control'];

export interface AccessUsersResponse {
    allModules: AppModuleMetadata[];
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

    const [allModules, modules, roleAssignments, roleRows, users] = await Promise.all([
        getAllAppModules(),
        getManagedAppModules(),
        getRoleModuleAssignments(),
        admin.from('dim_roles').select('role').order('role', { ascending: true }),
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
        allModules,
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

    const { error } = await createAdminClient().rpc('rbac_replace_role_modules', {
        p_role: roleSlug,
        p_modules: requestedModules,
    });
    if (error) throw new Error(error.message || 'Failed to update role modules');

    return { success: true };
}

export async function saveModuleVisibility(
    moduleSlug: string,
    enabled: boolean
): Promise<{ success: true }> {
    await requireAccessAdmin();

    if (!isAppModuleSlug(moduleSlug)) {
        throw new Error('Invalid module');
    }

    if (!enabled && PROTECTED_MODULE_SLUGS.includes(moduleSlug)) {
        throw new Error('This module cannot be hidden');
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('dim_modules')
        .update({ enabled })
        .eq('modules', moduleSlug);

    if (error) {
        throw new Error(error.message || 'Failed to update module visibility');
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

    const { error } = await createAdminClient().rpc('rbac_create_role', {
        p_role: roleSlug,
        p_name: roleSlug.replace(/_/g, ' '),
        p_modules: requestedModules,
    });
    if (error) throw new Error(error.message || 'Role creation failed');

    return { success: true };
}

export async function saveUserAccess(
    userId: string,
    role: string,
    overrides: Record<string, ModuleOverrideEffect | null>
): Promise<{ success: true }> {
    await requireAccessAdmin();

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

    const { error } = await createAdminClient().rpc('rbac_save_user_access', {
        p_user_id: userId,
        p_role: roleSlug,
        p_overrides: overrides,
    });
    if (error) throw new Error(error.message || 'Failed to save user access');

    return { success: true };
}
