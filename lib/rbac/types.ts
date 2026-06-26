import { AppModuleSlug, AppRoleSlug } from '@/lib/rbac/constants';

export type ModuleOverrideEffect = 'allow' | 'deny';

export interface AppModuleMetadata {
    description: string | null;
    icon: string | null;
    isAlwaysAllowed: boolean;
    isManaged: boolean;
    label: string;
    path: string;
    slug: AppModuleSlug;
    sortOrder: number;
}

export interface UserAppAccess {
    allowedModules: AppModuleSlug[];
    canManageAccess: boolean;
    modules: AppModuleMetadata[];
    overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect>>;
    role: AppRoleSlug;
    userId: string;
}

export interface AccessAdminUserRecord {
    displayName: string | null;
    email: string | null;
    id: string;
    overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect>>;
    role: AppRoleSlug;
    allowedModules: AppModuleSlug[];
}

export interface AccessAdminRoleRecord {
    role: AppRoleSlug;
    modules: AppModuleSlug[];
}
