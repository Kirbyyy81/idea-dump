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
