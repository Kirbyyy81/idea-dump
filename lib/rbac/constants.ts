export const APP_ROLE_SLUGS = ['owner', 'admin', 'member'] as const;
export type BuiltInAppRoleSlug = (typeof APP_ROLE_SLUGS)[number];
export type AppRoleSlug = string;

// The trusted dim_modules catalog defines module identities at runtime.
export type AppModuleSlug = string;

export const DEFAULT_APP_ROLE: BuiltInAppRoleSlug = 'member';
