import { AppModuleSlug } from './constants';

export interface ModuleRouteRule {
    module: AppModuleSlug;
    prefix: string;
    requiresManager?: boolean;
}

export const MODULE_ROUTE_RULES: readonly ModuleRouteRule[] = [
    { prefix: '/settings/access', module: 'access_control', requiresManager: true },
    { prefix: '/dashboard', module: 'dashboard' },
    { prefix: '/projects', module: 'projects' },
    { prefix: '/tickets/manage', module: 'tickets', requiresManager: true },
    { prefix: '/tickets', module: 'tickets' },
    { prefix: '/logs', module: 'logs' },
    { prefix: '/api-tools', module: 'logs' },
    { prefix: '/log-viewer', module: 'log_viewer' },
    { prefix: '/article-creation', module: 'article_creation' },
    { prefix: '/film', module: 'film_journal' },
    { prefix: '/finance', module: 'finance' },
    { prefix: '/settings', module: 'settings' },
];

function matchesRoutePrefix(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function findModuleRouteRule(pathname: string) {
    return MODULE_ROUTE_RULES.find((rule) => matchesRoutePrefix(pathname, rule.prefix));
}

export function matchesModuleRoute(pathname: string, module: AppModuleSlug) {
    return (
        (module === 'dashboard' && pathname === '/') ||
        MODULE_ROUTE_RULES.some(
            (rule) => rule.module === module && matchesRoutePrefix(pathname, rule.prefix)
        )
    );
}
