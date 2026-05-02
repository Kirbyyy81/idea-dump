'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AppModuleSlug, MODULE_LABELS } from '@/lib/rbac/constants';
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
    Settings2,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';

interface SidebarProps {
    projects: Project[];
}

const DEFAULT_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];

const MODULE_NAV_ITEMS: Array<{
    href: string;
    icon: JSX.Element;
    module: AppModuleSlug;
    label?: string;
    requiresManager?: boolean;
}> = [
    { href: '/tickets', icon: <Ticket size={18} />, module: 'tickets', label: 'My Tickets' },
    { href: '/tickets/new', icon: <Plus size={18} />, module: 'tickets', label: 'Raise Ticket' },
    { href: '/tickets/manage', icon: <Settings2 size={18} />, module: 'tickets', label: 'Manage Tickets', requiresManager: true },
    { href: '/logs', icon: <ClipboardList size={18} />, module: 'logs' },
    { href: '/api-tools', icon: <BookOpen size={18} />, module: 'api' },
    { href: '/settings/access', icon: <ShieldCheck size={18} />, module: 'access_control' },
    { href: '/article-creation', icon: <FilePenLine size={18} />, module: 'article_creation' },
];

export function Sidebar({ projects }: SidebarProps) {
    const pathname = usePathname();
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [allowedModules, setAllowedModules] = useState<AppModuleSlug[]>(DEFAULT_ALLOWED_MODULES);
    const [canManageAccess, setCanManageAccess] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function loadAccess() {
            try {
                const res = await fetch('/api/access/me');
                if (!res.ok) return;

                const payload = await res.json();
                if (!cancelled && payload.data?.allowed_modules) {
                    setAllowedModules(payload.data.allowed_modules);
                    setCanManageAccess(Boolean(payload.data.can_manage_access));
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
    const isAccessControlActive = pathname.startsWith('/settings/access');

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
                            {MODULE_LABELS.dashboard}
                        </Button>
                    </Link>
                )}

                {canAccessModule('projects') && (
                    <div
                        className="space-y-1 mb-6"
                        onMouseEnter={() => setIsProjectsOpen(true)}
                        onMouseLeave={() => setIsProjectsOpen(false)}
                    >
                        <Link href="/projects" className="block relative z-10">
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
                                <span className="flex-1 text-left">{MODULE_LABELS.projects}</span>
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

                {MODULE_NAV_ITEMS
                    .filter((item) => canAccessModule(item.module))
                    .filter((item) => !item.requiresManager || canManageAccess)
                    .map((item) => (
                    <Link key={item.href} href={item.href} className="block">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start',
                                (item.module === 'access_control'
                                    ? isAccessControlActive
                                    : pathname === item.href)
                                    ? item.module === 'logs' || item.module === 'tickets'
                                        ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                        : 'bg-bg-hover text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            icon={item.icon}
                        >
                            {item.label ?? MODULE_LABELS[item.module]}
                        </Button>
                    </Link>
                ))}
            </nav>

            <div className="p-4 border-t border-border-subtle">
                <Link href="/settings" className="block">
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
                        Settings
                    </Button>
                </Link>
            </div>
        </aside>
    );
}
