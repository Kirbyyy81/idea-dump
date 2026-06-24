export const APP_ROLE_SLUGS = ['owner', 'admin', 'member'] as const;
export type BuiltInAppRoleSlug = (typeof APP_ROLE_SLUGS)[number];
export type AppRoleSlug = string;

export const APP_MODULE_SLUGS = [
    'dashboard',
    'projects',
    'tickets',
    'logs',
    'log_viewer',
    'api',
    'access_control',
    'article_creation',
    'film_journal',
    'settings',
] as const;
export type AppModuleSlug = (typeof APP_MODULE_SLUGS)[number];

export const DEFAULT_APP_ROLE: BuiltInAppRoleSlug = 'member';
export const ALWAYS_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];
export const MANAGED_MODULE_SLUGS: AppModuleSlug[] = [
    'projects',
    'tickets',
    'logs',
    'log_viewer',
    'api',
    'access_control',
    'article_creation',
    'film_journal',
];
export const ACCESS_MANAGER_ROLES: AppRoleSlug[] = ['owner', 'admin'];

export const MODULE_PATHS: Record<AppModuleSlug, string> = {
    dashboard: '/dashboard',
    projects: '/projects',
    tickets: '/tickets',
    logs: '/logs',
    log_viewer: '/log-viewer',
    api: '/api-tools',
    access_control: '/settings/access',
    article_creation: '/article-creation',
    film_journal: '/film',
    settings: '/settings',
};

export const MODULE_REDIRECT_ORDER: AppModuleSlug[] = [
    'dashboard',
    'projects',
    'tickets',
    'film_journal',
    'logs',
    'log_viewer',
    'api',
    'access_control',
    'settings',
];

export const DEFAULT_ROLE_MODULES: Record<BuiltInAppRoleSlug, AppModuleSlug[]> = {
    owner: ['projects', 'tickets', 'logs', 'log_viewer', 'api', 'access_control', 'article_creation', 'film_journal'],
    admin: ['projects', 'tickets', 'logs', 'log_viewer', 'api', 'access_control', 'article_creation', 'film_journal'],
    member: ['tickets', 'logs', 'log_viewer', 'api', 'film_journal'],
};

export const MODULE_LABELS: Record<AppModuleSlug, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    tickets: 'Tickets',
    logs: 'Weekly Logs',
    log_viewer: 'Log Viewer',
    api: 'API',
    access_control: 'Access Control',
    article_creation: 'Article Creation',
    film_journal: 'Film Journal',
    settings: 'Settings',
};
