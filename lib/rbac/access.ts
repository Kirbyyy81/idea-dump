import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    APP_MODULE_SLUGS,
    AppModuleSlug,
    AppRoleSlug,
    DEFAULT_APP_ROLE,
} from '@/lib/rbac/constants';
import { AccessAdminRoleRecord, AppModuleMetadata, ModuleOverrideEffect, UserAppAccess } from '@/lib/rbac/types';

interface RoleRow {
    id: string;
    role: string;
}

interface OverrideRow {
    effect: ModuleOverrideEffect;
    DIM_modules: { modules: AppModuleSlug } | { modules: AppModuleSlug }[] | null;
}

interface RoleModuleRow {
    role_id: string;
    DIM_modules: { modules: AppModuleSlug } | { modules: AppModuleSlug }[] | null;
}

interface ModuleRow {
    description: string | null;
    enabled: boolean | null;
    icon: string | null;
    is_always_allowed: boolean | null;
    is_managed: boolean | null;
    modules: string;
    name: string;
    path: string | null;
    sort_order: number | null;
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

    const [rolesResult, modules] = await Promise.all([
        admin
        .from('DIM_roles')
            .select('id, role'),
        getAppModules(),
    ]);

    if (rolesResult.error) {
        throw new Error(rolesResult.error.message);
    }

    const typedRoles = (rolesResult.data || []) as RoleRow[];
    const roleBySlug = new Map(typedRoles.map((role) => [role.role, role]));

    const { data: userRoleRow, error: userRoleError } = await admin
        .from('BRIDGE_user_roles')
        .select('DIM_roles!inner(role)')
        .eq('user_id', userId)
        .maybeSingle();

    if (userRoleError) {
        throw new Error(userRoleError.message);
    }

    const resolvedRole = normalizeRoleSlug(unwrapMaybeArray(userRoleRow?.DIM_roles)?.role ?? DEFAULT_APP_ROLE);
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

    const alwaysAllowed = modules.filter((moduleRow) => moduleRow.isAlwaysAllowed).map((moduleRow) => moduleRow.slug);
    const allowed = new Set<AppModuleSlug>(alwaysAllowed);
    const roleModules = (roleModulesResult.data || []) as RoleModuleRow[];

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

    for (const moduleSlug of alwaysAllowed) {
        allowed.add(moduleSlug);
    }

    const allowedModules = modules.filter((moduleRow) => allowed.has(moduleRow.slug));

    return {
        allowedModules: allowedModules.map((moduleRow) => moduleRow.slug),
        canManageAccess: allowed.has('access_control'),
        modules: allowedModules,
        overrides,
        role: resolvedRole,
        userId,
    };
}

export async function getRoleModuleAssignments(): Promise<AccessAdminRoleRecord[]> {
    const admin = createAdminClient();

    const [rolesResult, managedModules] = await Promise.all([
        admin
            .from('DIM_roles')
            .select('id, role')
            .order('role', { ascending: true }),
        getManagedAppModules(),
    ]);

    if (rolesResult.error) {
        throw new Error(rolesResult.error.message);
    }

    const typedRoles = (rolesResult.data || []) as RoleRow[];
    const roleIds = typedRoles.map((role) => role.id);

    const { data: roleModules, error: roleModulesError } = roleIds.length
        ? await admin
            .from('BRIDGE_role_modules')
            .select('role_id, DIM_modules!inner(modules)')
            .in('role_id', roleIds)
        : { data: [], error: null };

    if (roleModulesError) {
        throw new Error(roleModulesError.message);
    }

    const modulesByRoleId = new Map<string, Set<AppModuleSlug>>();
    for (const row of (roleModules || []) as RoleModuleRow[]) {
        const moduleSlug = unwrapMaybeArray(row.DIM_modules)?.modules;
        if (!isManagedModuleSlug(moduleSlug)) continue;

        if (!modulesByRoleId.has(row.role_id)) {
            modulesByRoleId.set(row.role_id, new Set<AppModuleSlug>());
        }

        modulesByRoleId.get(row.role_id)?.add(moduleSlug);
    }

    const orderedRoles = [
        ...typedRoles.filter((row) => row.role === 'owner' || row.role === 'admin' || row.role === 'member'),
        ...typedRoles.filter((row) => row.role !== 'owner' && row.role !== 'admin' && row.role !== 'member'),
    ];

    return orderedRoles.map((roleRow) => {
        const roleSlug = roleRow.role;
        const moduleSet = modulesByRoleId.get(roleRow.id) ?? new Set<AppModuleSlug>();

        return {
            modules: managedModules.map((moduleRow) => moduleRow.slug).filter((moduleSlug) => moduleSet.has(moduleSlug)),
            role: roleSlug,
        };
    });
}

export async function getAppModules(): Promise<AppModuleMetadata[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('DIM_modules')
        .select('modules, name, path, sort_order, is_managed, is_always_allowed, icon, description, enabled')
        .eq('enabled', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    return ((data || []) as ModuleRow[])
        .map(toModuleMetadata)
        .filter((moduleRow): moduleRow is AppModuleMetadata => Boolean(moduleRow));
}

export async function getManagedAppModules(): Promise<AppModuleMetadata[]> {
    return (await getAppModules()).filter((moduleRow) => moduleRow.isManaged);
}

export function canAccessModule(access: UserAppAccess, moduleSlug: AppModuleSlug) {
    return access.allowedModules.includes(moduleSlug);
}

export function getFirstAllowedModulePath(access: UserAppAccess) {
    return access.modules[0]?.path ?? '/settings';
}

export function normalizeRoleSlug(value?: string | null): AppRoleSlug {
    return value?.trim() || DEFAULT_APP_ROLE;
}

export function isAppModuleSlug(value?: string | null): value is AppModuleSlug {
    return APP_MODULE_SLUGS.includes(value as AppModuleSlug);
}

export function isManagedModuleSlug(value?: string | null): value is AppModuleSlug {
    return isAppModuleSlug(value);
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

function toModuleMetadata(row: ModuleRow): AppModuleMetadata | null {
    if (!isAppModuleSlug(row.modules) || !isSafeInternalPath(row.path)) {
        return null;
    }

    return {
        description: row.description,
        icon: row.icon,
        isAlwaysAllowed: Boolean(row.is_always_allowed),
        isManaged: Boolean(row.is_managed),
        label: row.name,
        path: row.path,
        slug: row.modules,
        sortOrder: row.sort_order ?? 0,
    };
}

function isSafeInternalPath(value?: string | null): value is string {
    return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.includes('://'));
}
