'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AppModuleSlug } from '@/lib/rbac/constants';
import { AppModuleMetadata } from '@/lib/rbac/types';
import {
    LayoutDashboard,
    FolderKanban,
    Settings,
    ShieldCheck,
    ChevronRight,
    ClipboardList,
    FileSearch,
    BookOpen,
    FilePenLine,
    Film,
    Ticket,
    Plus,
    Settings2,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';

interface SidebarProps {
    projects: Project[];
}

const DEFAULT_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];
const SHELL_MODULES: Record<'dashboard' | 'settings', { href: string; label: string }> = {
    dashboard: { href: '/dashboard', label: 'Dashboard' },
    settings: { href: '/settings', label: 'Settings' },
};

const MODULE_ICONS: Record<string, JSX.Element> = {
    BookOpen: <BookOpen size={18} />,
    ClipboardList: <ClipboardList size={18} />,
    FilePenLine: <FilePenLine size={18} />,
    FileSearch: <FileSearch size={18} />,
    Film: <Film size={18} />,
    FolderKanban: <FolderKanban size={18} />,
    ShieldCheck: <ShieldCheck size={18} />,
    Ticket: <Ticket size={18} />,
};

interface AccessPayload {
    allowed_modules?: AppModuleSlug[];
    can_manage_access?: boolean;
    modules?: AppModuleMetadata[];
}

export function Sidebar({ projects }: SidebarProps) {
    const pathname = usePathname();
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [isTicketsOpen, setIsTicketsOpen] = useState(false);
    const [allowedModules, setAllowedModules] = useState<AppModuleSlug[]>(DEFAULT_ALLOWED_MODULES);
    const [modules, setModules] = useState<AppModuleMetadata[]>([]);
    const [canManageAccess, setCanManageAccess] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function loadAccess() {
            try {
                const res = await fetch('/api/access/me');
                if (!res.ok) return;

                const payload = await res.json();
                const accessData = payload.data as AccessPayload;
                if (!cancelled && accessData.allowed_modules) {
                    setAllowedModules(accessData.allowed_modules);
                    setModules(accessData.modules ?? []);
                    setCanManageAccess(Boolean(accessData.can_manage_access));
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

    const canAccessModule = (moduleSlug: AppModuleSlug) => allowedModules.includes(moduleSlug);
    const isDashboardActive = pathname === '/' || pathname.startsWith('/dashboard');
    const isProjectsActive = pathname === '/projects' || pathname.startsWith('/project/');
    const isTicketsActive = pathname === '/tickets' || pathname.startsWith('/tickets/');
    const isAccessControlActive = pathname.startsWith('/settings/access');
    const moduleBySlug = new Map(modules.map((moduleRow) => [moduleRow.slug, moduleRow]));
    const getModuleLabel = (moduleSlug: AppModuleSlug) => {
        if (moduleSlug === 'api') return 'API Docs';
        return moduleBySlug.get(moduleSlug)?.label ?? moduleSlug;
    };
    const getModulePath = (moduleSlug: AppModuleSlug) => {
        if (moduleSlug === 'api') return '/docs';
        return moduleBySlug.get(moduleSlug)?.path;
    };
    const navModules = modules.filter((moduleRow) =>
        moduleRow.isManaged &&
        moduleRow.slug !== 'projects' &&
        moduleRow.slug !== 'tickets' &&
        canAccessModule(moduleRow.slug)
    );

    return (
        <aside className="w-64 h-screen fixed left-0 top-0 flex flex-col bg-bg-elevated border-r border-border-default">
            <div className="p-6 border-b border-border-subtle">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Image
                        src="/logo.png"
                        alt="IdeaDump Logo"
                        width={24}
                        height={24}
                        className="w-6 h-6 object-contain"
                    />
                    <span className="font-bold text-xl font-heading text-text-primary">
                        IdeaDump
                    </span>
                </Link>
            </div>

            <nav className="flex-1 p-4 overflow-y-auto">
                {canAccessModule('dashboard') && (
                    <Link href="/dashboard" className="block mb-2">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start',
                                isDashboardActive
                                    ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            icon={<LayoutDashboard size={18} />}
                        >
                            {SHELL_MODULES.dashboard.label}
                        </Button>
                    </Link>
                )}

                {canAccessModule('projects') && (
                    <div
                        className="space-y-1 mb-6"
                        onMouseEnter={() => setIsProjectsOpen(true)}
                        onMouseLeave={() => setIsProjectsOpen(false)}
                    >
                        <Link href={getModulePath('projects') ?? '/projects'} className="block relative z-10">
                            <Button
                                variant="ghost"
                                className={cn(
                                    'w-full justify-start',
                                    isProjectsActive
                                        ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                        : 'text-text-secondary hover:text-text-primary'
                                )}
                                icon={<FolderKanban size={18} />}
                                onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                            >
                                <span className="flex-1 text-left">{getModuleLabel('projects')}</span>
                                {projects.length > 0 && (
                                    <ChevronRight
                                        size={14}
                                        className={cn(
                                            'transition-transform text-text-muted',
                                            isProjectsOpen && 'rotate-90'
                                        )}
                                    />
                                )}
                            </Button>
                        </Link>

                        <div
                            className={cn(
                                'transition-all duration-200 ease-in-out overflow-hidden',
                                isProjectsOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
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
                                                className="block"
                                            >
                                                <Button
                                                    variant="ghost"
                                                    className={cn(
                                                        'w-full justify-start text-xs py-1.5 h-7 font-normal truncate',
                                                        pathname === `/project/${project.id}`
                                                            ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                                            : 'text-text-secondary hover:text-text-primary'
                                                    )}
                                                >
                                                    <span className="truncate">{project.title}</span>
                                                </Button>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {canAccessModule('tickets') && (
                    <div
                        className="space-y-1 mb-6"
                        onMouseEnter={() => setIsTicketsOpen(true)}
                        onMouseLeave={() => setIsTicketsOpen(false)}
                    >
                        <Link href={getModulePath('tickets') ?? '/tickets'} className="block relative z-10">
                            <Button
                                variant="ghost"
                                className={cn(
                                    'w-full justify-start',
                                    isTicketsActive
                                        ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                        : 'text-text-secondary hover:text-text-primary'
                                )}
                                icon={<Ticket size={18} />}
                                onClick={() => setIsTicketsOpen(!isTicketsOpen)}
                            >
                                <span className="flex-1 text-left">{getModuleLabel('tickets')}</span>
                                <ChevronRight
                                    size={14}
                                    className={cn(
                                        'transition-transform text-text-muted',
                                        isTicketsOpen && 'rotate-90'
                                    )}
                                />
                            </Button>
                        </Link>

                        <div
                            className={cn(
                                'transition-all duration-200 ease-in-out overflow-hidden',
                                isTicketsOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                            )}
                        >
                            <div className="pl-4 space-y-1 pt-1">
                                <div className="space-y-0.5">
                                    <Link href="/tickets" className="block">
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                'w-full justify-start text-sm py-1.5 h-8 font-normal',
                                                pathname === '/tickets'
                                                    ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                                    : 'text-text-secondary hover:text-text-primary'
                                            )}
                                        >
                                            View Tickets
                                        </Button>
                                    </Link>
                                    <Link href="/tickets/new" className="block">
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                'w-full justify-start text-sm py-1.5 h-8 font-normal',
                                                pathname === '/tickets/new'
                                                    ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                                    : 'text-text-secondary hover:text-text-primary'
                                            )}
                                            icon={<Plus size={14} />}
                                        >
                                            Raise Ticket
                                        </Button>
                                    </Link>
                                    {canManageAccess && (
                                        <Link href="/tickets/manage" className="block">
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-start text-sm py-1.5 h-8 font-normal',
                                                    pathname === '/tickets/manage'
                                                        ? 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none'
                                                        : 'text-text-secondary hover:text-text-primary'
                                                )}
                                                icon={<Settings2 size={14} />}
                                            >
                                                Manage Tickets
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {navModules.map((item) => {
                    const itemPath = getModulePath(item.slug) ?? item.path;
                    const itemLabel = getModuleLabel(item.slug);

                    return (
                        <Link key={item.slug} href={itemPath} className="block">
                            <Button
                                variant="ghost"
                                className={cn(
                                    'w-full justify-start',
                                    (item.slug === 'access_control'
                                        ? isAccessControlActive
                                        : item.slug === 'film_journal'
                                            ? pathname.startsWith('/film')
                                            : pathname === itemPath)
                                        ? item.slug === 'logs' || item.slug === 'log_viewer' || item.slug === 'tickets'
                                            ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                            : 'bg-bg-hover text-text-primary'
                                        : 'text-text-secondary hover:text-text-primary'
                                )}
                                icon={item.icon ? MODULE_ICONS[item.icon] : undefined}
                            >
                                {itemLabel}
                            </Button>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-border-subtle">
                <Link href={SHELL_MODULES.settings.href} className="block">
                    <Button
                        variant="ghost"
                        className={cn(
                            'w-full justify-start',
                            pathname === '/settings'
                                ? 'bg-bg-hover text-text-primary'
                                : 'text-text-secondary'
                        )}
                        icon={<Settings size={18} />}
                    >
                        {SHELL_MODULES.settings.label}
                    </Button>
                </Link>
            </div>
        </aside>
    );
}
