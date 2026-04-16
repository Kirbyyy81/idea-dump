export const APP_ROLE_SLUGS = ['owner', 'admin', 'member'] as const;
export type AppRoleSlug = (typeof APP_ROLE_SLUGS)[number];

export const APP_MODULE_SLUGS = [
    'dashboard',
    'projects',
    'logs',
    'api',
    'article_creation',
    'settings',
] as const;
export type AppModuleSlug = (typeof APP_MODULE_SLUGS)[number];

export const DEFAULT_APP_ROLE: AppRoleSlug = 'member';
export const ALWAYS_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];
export const MANAGED_MODULE_SLUGS: AppModuleSlug[] = ['projects', 'logs', 'api', 'article_creation'];
export const ACCESS_MANAGER_ROLES: AppRoleSlug[] = ['owner', 'admin'];

export const MODULE_PATHS: Record<AppModuleSlug, string> = {
    dashboard: '/dashboard',
    projects: '/projects',
    logs: '/logs',
    api: '/api-tools',
    article_creation: '/article-creation',
    settings: '/settings',
};

export const MODULE_REDIRECT_ORDER: AppModuleSlug[] = [
    'dashboard',
    'projects',
    'logs',
    'api',
    'settings',
];

export const DEFAULT_ROLE_MODULES: Record<AppRoleSlug, AppModuleSlug[]> = {
    owner: ['projects', 'logs', 'api', 'article_creation'],
    admin: ['projects', 'logs', 'api', 'article_creation'],
    member: ['logs', 'api'],
};

export const MODULE_LABELS: Record<AppModuleSlug, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    logs: 'Weekly Logs',
    api: 'API',
    article_creation: 'Article Creation',
    settings: 'Settings',
};
