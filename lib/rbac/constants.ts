export const APP_ROLE_SLUGS = ['owner', 'admin', 'member'] as const;
export type BuiltInAppRoleSlug = (typeof APP_ROLE_SLUGS)[number];
export type AppRoleSlug = string;

export const APP_MODULE_SLUGS = [
    'dashboard',
    'projects',
    'tickets',
    'logs',
    'api',
    'access_control',
    'article_creation',
    'settings',
] as const;
export type AppModuleSlug = (typeof APP_MODULE_SLUGS)[number];

export const DEFAULT_APP_ROLE: BuiltInAppRoleSlug = 'member';
export const ALWAYS_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];
export const MANAGED_MODULE_SLUGS: AppModuleSlug[] = [
    'projects',
    'tickets',
    'logs',
    'api',
    'access_control',
    'article_creation',
];
export const ACCESS_MANAGER_ROLES: AppRoleSlug[] = ['owner', 'admin'];

export const MODULE_PATHS: Record<AppModuleSlug, string> = {
    dashboard: '/dashboard',
    projects: '/projects',
    tickets: '/tickets',
    logs: '/logs',
    api: '/api-tools',
    access_control: '/settings/access',
    article_creation: '/article-creation',
    settings: '/settings',
};

export const MODULE_REDIRECT_ORDER: AppModuleSlug[] = [
    'dashboard',
    'projects',
    'tickets',
    'logs',
    'api',
    'access_control',
    'settings',
];

export const DEFAULT_ROLE_MODULES: Record<BuiltInAppRoleSlug, AppModuleSlug[]> = {
    owner: ['projects', 'tickets', 'logs', 'api', 'access_control', 'article_creation'],
    admin: ['projects', 'tickets', 'logs', 'api', 'access_control', 'article_creation'],
    member: ['tickets', 'logs', 'api'],
};

export const MODULE_LABELS: Record<AppModuleSlug, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    tickets: 'Tickets',
    logs: 'Weekly Logs',
    api: 'API',
    access_control: 'Access Control',
    article_creation: 'Article Creation',
    settings: 'Settings',
};
