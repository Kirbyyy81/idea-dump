'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AppModuleSlug, MODULE_LABELS } from '@/lib/rbac/constants';
import { AppRoleSlug } from '@/lib/rbac/constants';
import {
    LayoutDashboard,
    FolderKanban,
    Settings,
    ShieldCheck,
    ChevronRight,
    ClipboardList,
    BookOpen,
    FilePenLine,
    Ticket,
    Plus,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
    projects: Project[];
}

const DEFAULT_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];
const SIDEBAR_STORAGE_KEY = 'ideadump-sidebar-collapsed';
const SIDEBAR_EXPANDED_WIDTH = '16rem';
const SIDEBAR_COLLAPSED_WIDTH = '5rem';

const MODULE_NAV_ITEMS: Array<{ href: string; icon: JSX.Element; module: AppModuleSlug }> = [
    { href: '/api-tools', icon: <BookOpen size={18} />, module: 'api' },
    { href: '/settings/access', icon: <ShieldCheck size={18} />, module: 'access_control' },
    { href: '/article-creation', icon: <FilePenLine size={18} />, module: 'article_creation' },
];

export function Sidebar({ projects }: SidebarProps) {
    const pathname = usePathname();
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [allowedModules, setAllowedModules] = useState<AppModuleSlug[]>(DEFAULT_ALLOWED_MODULES);
    const [accessRole, setAccessRole] = useState<AppRoleSlug | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function loadAccess() {
            try {
                const res = await fetch('/api/access/me');
                if (!res.ok) return;

                const payload = await res.json();
                if (!cancelled && payload.data?.allowed_modules) {
                    setAllowedModules(payload.data.allowed_modules);
                    setAccessRole(payload.data.role ?? null);
                }
            } catch {
                // Keep safe defaults if access loading fails.
            }
        }

        loadAccess();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (storedValue === 'true') {
            setIsCollapsed(true);
        }
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const width = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
        document.documentElement.style.setProperty('--sidebar-width', width);
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
    }, [isCollapsed]);

    const canAccessModule = (moduleSlug: AppModuleSlug) => allowedModules.includes(moduleSlug);
    const canManageTickets = accessRole === 'owner' || accessRole === 'admin';
    const isDashboardActive = pathname === '/' || pathname.startsWith('/dashboard');
    const isProjectsActive = pathname === '/projects' || pathname.startsWith('/project/');
    const isAccessControlActive = pathname.startsWith('/settings/access');
    const navLinkClass = cn(
        'btn-ghost w-full',
        isCollapsed ? 'justify-center px-0' : 'justify-start'
    );

    return (
        <aside
            className="fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-border-default bg-bg-elevated transition-[width] duration-200"
            style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
        >
            <div className={cn('border-b border-border-subtle', isCollapsed ? 'p-4' : 'p-6')}>
                <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'justify-between gap-3')}>
                    <Link
                        href="/dashboard"
                        className={cn('flex min-w-0 items-center', isCollapsed ? 'justify-center' : 'gap-2')}
                    >
                        <Image
                            src="/logo.png"
                            alt="IdeaDump Logo"
                            width={24}
                            height={24}
                            className="h-6 w-6 object-contain"
                        />
                        {!isCollapsed ? (
                            <span className="truncate font-heading text-xl font-bold text-text-primary">
                                IdeaDump
                            </span>
                        ) : null}
                    </Link>
                    {!isCollapsed ? (
                        <button
                            type="button"
                            onClick={() => setIsCollapsed(true)}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-default text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text-primary"
                            aria-label="Collapse sidebar"
                        >
                            <PanelLeftClose size={16} />
                        </button>
                    ) : null}
                </div>
                {isCollapsed ? (
                    <button
                        type="button"
                        onClick={() => setIsCollapsed(false)}
                        className="mt-4 flex h-9 w-full items-center justify-center rounded-md border border-border-default text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text-primary"
                        aria-label="Expand sidebar"
                    >
                        <PanelLeftOpen size={16} />
                    </button>
                ) : null}
            </div>

            <nav className={cn('flex-1 overflow-y-auto', isCollapsed ? 'p-3' : 'p-4')}>
                {canAccessModule('dashboard') && (
                    <Link
                        href="/dashboard"
                        className={cn(
                            navLinkClass,
                            'mb-2',
                            isDashboardActive
                                ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                : 'text-text-secondary hover:text-text-primary'
                        )}
                        aria-label={isCollapsed ? MODULE_LABELS.dashboard : undefined}
                        title={isCollapsed ? MODULE_LABELS.dashboard : undefined}
                    >
                        <span className={cn(isCollapsed ? '' : 'mr-2')}>
                            <LayoutDashboard size={18} />
                        </span>
                        {!isCollapsed ? <span>{MODULE_LABELS.dashboard}</span> : null}
                    </Link>
                )}

                {canAccessModule('projects') && (
                    <div
                        className={cn('space-y-1 mb-6', isCollapsed ? 'mb-2' : 'mb-6')}
                        onMouseEnter={() => setIsProjectsOpen(true)}
                        onMouseLeave={() => setIsProjectsOpen(false)}
                    >
                        <Link
                            href="/projects"
                            className={cn(
                                navLinkClass,
                                'relative z-10',
                                isProjectsActive
                                    ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                            aria-label={isCollapsed ? MODULE_LABELS.projects : undefined}
                            title={isCollapsed ? MODULE_LABELS.projects : undefined}
                        >
                            <span className={cn(isCollapsed ? '' : 'mr-2')}>
                                <FolderKanban size={18} />
                            </span>
                            {!isCollapsed ? (
                                <span className="flex-1 text-left">{MODULE_LABELS.projects}</span>
                            ) : null}
                            {!isCollapsed && projects.length > 0 ? (
                                <ChevronRight
                                    size={14}
                                    className={cn(
                                        'transition-transform text-text-muted',
                                        isProjectsOpen && 'rotate-90'
                                    )}
                                />
                            ) : null}
                        </Link>

                        <div
                            className={cn(
                                'transition-all duration-200 ease-in-out overflow-hidden',
                                !isCollapsed && isProjectsOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                            )}
                        >
                            <div className="pl-4 space-y-1 pt-1">
                                <div className="space-y-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {projects.length === 0 ? (
                                        <p className="px-3 py-1.5 text-xs text-text-muted italic">
                                            No projects
                                        </p>
                                    ) : (
                                        projects.map((project) => (
                                            <Link
                                                key={project.id}
                                                href={`/project/${project.id}`}
                                                className={cn(
                                                    navLinkClass,
                                                    'text-xs py-1.5 h-7 font-normal truncate',
                                                    pathname === `/project/${project.id}`
                                                        ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                                        : 'text-text-secondary hover:text-text-primary'
                                                )}
                                            >
                                                <span className="truncate">{project.title}</span>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {canAccessModule('logs') && (
                    <Link
                        href="/logs"
                        className={cn(
                            navLinkClass,
                            pathname === '/logs'
                                ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                : 'text-text-secondary hover:text-text-primary'
                        )}
                        aria-label={isCollapsed ? MODULE_LABELS.logs : undefined}
                        title={isCollapsed ? MODULE_LABELS.logs : undefined}
                    >
                        <span className={cn(isCollapsed ? '' : 'mr-2')}>
                            <ClipboardList size={18} />
                        </span>
                        {!isCollapsed ? <span>{MODULE_LABELS.logs}</span> : null}
                    </Link>
                )}

                {canAccessModule('tickets') && (
                    <>
                        <Link
                            href="/tickets"
                            className={cn(
                                navLinkClass,
                                pathname === '/tickets'
                                    ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            aria-label={isCollapsed ? 'My Tickets' : undefined}
                            title={isCollapsed ? 'My Tickets' : undefined}
                        >
                            <span className={cn(isCollapsed ? '' : 'mr-2')}>
                                <Ticket size={18} />
                            </span>
                            {!isCollapsed ? <span>My Tickets</span> : null}
                        </Link>

                        <Link
                            href="/tickets/new"
                            className={cn(
                                navLinkClass,
                                pathname.startsWith('/tickets/new')
                                    ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            aria-label={isCollapsed ? 'Raise Ticket' : undefined}
                            title={isCollapsed ? 'Raise Ticket' : undefined}
                        >
                            <span className={cn(isCollapsed ? '' : 'mr-2')}>
                                <Plus size={18} />
                            </span>
                            {!isCollapsed ? <span>Raise Ticket</span> : null}
                        </Link>

                        {canManageTickets && (
                            <Link
                                href="/tickets/manage"
                                className={cn(
                                    navLinkClass,
                                    pathname.startsWith('/tickets/manage')
                                        ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                        : 'text-text-secondary hover:text-text-primary'
                                )}
                                aria-label={isCollapsed ? 'Manage Tickets' : undefined}
                                title={isCollapsed ? 'Manage Tickets' : undefined}
                            >
                                <span className={cn(isCollapsed ? '' : 'mr-2')}>
                                    <Ticket size={18} />
                                </span>
                                {!isCollapsed ? <span>Manage Tickets</span> : null}
                            </Link>
                        )}
                    </>
                )}

                {MODULE_NAV_ITEMS.filter((item) => canAccessModule(item.module)).map((item) => (
                    <Link
                        key={item.module}
                        href={item.href}
                        className={cn(
                            navLinkClass,
                            (item.module === 'access_control'
                                ? isAccessControlActive
                                : pathname === item.href)
                                ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                : 'text-text-secondary hover:text-text-primary'
                        )}
                        aria-label={isCollapsed ? MODULE_LABELS[item.module] : undefined}
                        title={isCollapsed ? MODULE_LABELS[item.module] : undefined}
                    >
                        <span className={cn(isCollapsed ? '' : 'mr-2')}>{item.icon}</span>
                        {!isCollapsed ? <span>{MODULE_LABELS[item.module]}</span> : null}
                    </Link>
                ))}
            </nav>

            <div className={cn('border-t border-border-subtle', isCollapsed ? 'p-3' : 'p-4')}>
                <Link
                    href="/settings"
                    className={cn(
                        navLinkClass,
                        pathname === '/settings'
                            ? 'bg-bg-hover text-text-primary'
                            : 'text-text-secondary'
                    )}
                    aria-label={isCollapsed ? 'Settings' : undefined}
                    title={isCollapsed ? 'Settings' : undefined}
                >
                    <span className={cn(isCollapsed ? '' : 'mr-2')}>
                        <Settings size={18} />
                    </span>
                    {!isCollapsed ? <span>Settings</span> : null}
                </Link>
            </div>
        </aside>
    );
}
