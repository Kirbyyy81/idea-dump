import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    ACCESS_MANAGER_ROLES,
    ALWAYS_ALLOWED_MODULES,
    APP_MODULE_SLUGS,
    APP_ROLE_SLUGS,
    AppModuleSlug,
    AppRoleSlug,
    DEFAULT_ROLE_MODULES,
    DEFAULT_APP_ROLE,
    MANAGED_MODULE_SLUGS,
    MODULE_PATHS,
    MODULE_REDIRECT_ORDER,
} from '@/lib/rbac/constants';
import { ModuleOverrideEffect, UserAppAccess } from '@/lib/rbac/types';

interface RoleRow {
    id: string;
    role: AppRoleSlug;
}

interface OverrideRow {
    effect: ModuleOverrideEffect;
    DIM_modules: { modules: AppModuleSlug } | { modules: AppModuleSlug }[] | null;
}

interface RoleModuleRow {
    DIM_modules: { modules: AppModuleSlug } | { modules: AppModuleSlug }[] | null;
}

export async function getSessionUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

export async function getSessionUserAppAccess() {
    const user = await getSessionUser();
    if (!user) {
        return null;
    }

    const access = await getUserAppAccess(user.id);
    return { access, user };
}

export async function getUserAppAccess(userId: string): Promise<UserAppAccess> {
    const admin = createAdminClient();

    const { data: roles, error: rolesError } = await admin
        .from('DIM_roles')
        .select('id, role')
        .in('role', [...APP_ROLE_SLUGS]);

    if (rolesError) {
        throw new Error(rolesError.message);
    }

    const typedRoles = (roles || []) as RoleRow[];
    const roleBySlug = new Map(typedRoles.map((role) => [role.role, role]));

    const { data: userRoleRow, error: userRoleError } = await admin
        .from('BRIDGE_user_roles')
        .select('DIM_roles!inner(role)')
        .eq('user_id', userId)
        .maybeSingle();

    if (userRoleError) {
        throw new Error(userRoleError.message);
    }

    const resolvedRole = normalizeRoleSlug(
        unwrapMaybeArray(userRoleRow?.DIM_roles)?.role ?? DEFAULT_APP_ROLE
    );
    const roleRecord = roleBySlug.get(resolvedRole);

    const [roleModulesResult, overridesResult] = await Promise.all([
        roleRecord
            ? admin
                .from('BRIDGE_role_modules')
                .select('DIM_modules!inner(modules)')
                .eq('role_id', roleRecord.id)
            : Promise.resolve({ data: [], error: null }),
        admin
            .from('app_user_module_overrides')
            .select('effect, DIM_modules!inner(modules)')
            .eq('user_id', userId),
    ]);

    if (roleModulesResult.error) {
        throw new Error(roleModulesResult.error.message);
    }
    if (overridesResult.error) {
        throw new Error(overridesResult.error.message);
    }

    const allowed = new Set<AppModuleSlug>(ALWAYS_ALLOWED_MODULES);
    const roleModules = (roleModulesResult.data || []) as RoleModuleRow[];

    if (roleModules.length === 0) {
        for (const moduleSlug of DEFAULT_ROLE_MODULES[resolvedRole] || []) {
            allowed.add(moduleSlug);
        }
    }

    for (const row of roleModules) {
        const moduleSlug = unwrapMaybeArray(row.DIM_modules)?.modules;
        if (isAppModuleSlug(moduleSlug)) {
            allowed.add(moduleSlug);
        }
    }

    const overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect>> = {};
    for (const row of (overridesResult.data || []) as OverrideRow[]) {
        const moduleSlug = unwrapMaybeArray(row.DIM_modules)?.modules;
        if (!isAppModuleSlug(moduleSlug)) continue;

        overrides[moduleSlug] = row.effect;
        if (row.effect === 'allow') {
            allowed.add(moduleSlug);
        } else if (row.effect === 'deny') {
            allowed.delete(moduleSlug);
        }
    }

    for (const moduleSlug of ALWAYS_ALLOWED_MODULES) {
        allowed.add(moduleSlug);
    }

    return {
        allowedModules: APP_MODULE_SLUGS.filter((slug) => allowed.has(slug)),
        canManageAccess: ACCESS_MANAGER_ROLES.includes(resolvedRole),
        overrides,
        role: resolvedRole,
        userId,
    };
}

export function canAccessModule(access: UserAppAccess, moduleSlug: AppModuleSlug) {
    return access.allowedModules.includes(moduleSlug);
}

export function getFirstAllowedModulePath(access: UserAppAccess) {
    const firstModule =
        MODULE_REDIRECT_ORDER.find((moduleSlug) => canAccessModule(access, moduleSlug)) ??
        'settings';

    return MODULE_PATHS[firstModule];
}

export function normalizeRoleSlug(value?: string | null): AppRoleSlug {
    return APP_ROLE_SLUGS.includes(value as AppRoleSlug)
        ? (value as AppRoleSlug)
        : DEFAULT_APP_ROLE;
}

export function isAppModuleSlug(value?: string | null): value is AppModuleSlug {
    return APP_MODULE_SLUGS.includes(value as AppModuleSlug);
}

export function isManagedModuleSlug(value?: string | null): value is AppModuleSlug {
    return MANAGED_MODULE_SLUGS.includes(value as AppModuleSlug);
}

export function getDisplayName(user: User) {
    const metadata = user.user_metadata ?? {};
    return (
        metadata.full_name ??
        metadata.name ??
        metadata.user_name ??
        metadata.preferred_username ??
        null
    );
}

function unwrapMaybeArray<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
}
