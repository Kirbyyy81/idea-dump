'use client';

import { JSX, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AppModuleSlug } from '@/lib/rbac/constants';
import { AppModuleMetadata } from '@/lib/rbac/types';
import { useAccess } from '@/lib/contexts/AccessContext';
import {
    BarChart3,
    BookOpen,
    Camera,
    ChevronRight,
    ClipboardList,
    FilePenLine,
    FileSearch,
    Film,
    FolderKanban,
    LayoutDashboard,
    Plus,
    Settings,
    Settings2,
    ShieldCheck,
    Ticket,
} from 'lucide-react';

interface SidebarProps {
    projects: Project[];
}

interface SidebarSubItem {
    href: string;
    icon?: JSX.Element;
    isActive?: boolean;
    label: string;
}

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

const GROUP_ACTIVE_CLASS = 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose';
const GROUP_INACTIVE_CLASS = 'text-text-secondary hover:text-text-primary';
const SUBITEM_ACTIVE_CLASS = 'bg-bg-hover text-text-primary border-l-2 border-accent-rose rounded-l-none';
const SUBITEM_INACTIVE_CLASS = 'text-text-secondary hover:text-text-primary';

function isExactPath(pathname: string, href: string) {
    return pathname === href;
}

function isProjectRoute(pathname: string) {
    return pathname === '/projects' || pathname.startsWith('/projects/');
}

function isFilmRoute(pathname: string) {
    return pathname === '/film' || pathname.startsWith('/film/');
}

export function Sidebar({ projects }: SidebarProps) {
    const pathname = usePathname();
    const [openGroups, setOpenGroups] = useState<Partial<Record<'projects' | 'tickets' | 'film', boolean>>>({});
    const access = useAccess();
    const allowedModules = access?.allowedModules ?? [];
    const modules = access?.modules ?? [];
    const canManageAccess = access?.canManageAccess ?? false;

    const canAccessModule = (moduleSlug: AppModuleSlug) => allowedModules.includes(moduleSlug);
    const isDashboardActive = pathname === '/' || pathname.startsWith('/dashboard');
    const isProjectsActive = isProjectRoute(pathname);
    const isTicketsActive = pathname === '/tickets' || pathname.startsWith('/tickets/');
    const isFilmActive = isFilmRoute(pathname);
    const isAccessControlActive = pathname.startsWith('/settings/access');
    const moduleBySlug = new Map(modules.map((moduleRow) => [moduleRow.slug, moduleRow]));
    const getModuleLabel = (moduleSlug: AppModuleSlug, fallback: string = moduleSlug) =>
        moduleBySlug.get(moduleSlug)?.label ?? fallback;
    const getModulePath = (moduleSlug: AppModuleSlug, fallback: string) =>
        moduleBySlug.get(moduleSlug)?.path ?? fallback;
    const navModules = modules.filter((moduleRow) =>
        moduleRow.isManaged &&
        moduleRow.slug !== 'projects' &&
        moduleRow.slug !== 'tickets' &&
        moduleRow.slug !== 'film_journal' &&
        canAccessModule(moduleRow.slug)
    );

    const renderSubItem = ({ href, icon, isActive, label }: SidebarSubItem) => (
        <Link
            key={href}
            href={href}
            className={cn(
                'btn-ghost w-full justify-start text-sm py-1.5 h-8 font-normal',
                isActive ? SUBITEM_ACTIVE_CLASS : SUBITEM_INACTIVE_CLASS
            )}
        >
            {icon && <span className="mr-2">{icon}</span>}
            <span className="truncate">{label}</span>
        </Link>
    );

    const renderModuleGroup = ({
        active,
        children,
        group,
        href,
        icon,
        label,
    }: {
        active: boolean;
        children: JSX.Element;
        group: 'projects' | 'tickets' | 'film';
        href: string;
        icon: JSX.Element;
        label: string;
    }) => {
        const isOpen = Boolean(openGroups[group] || active);

        return (
            <div
                className="space-y-1 mb-6"
                onMouseEnter={() => setOpenGroups((current) => ({ ...current, [group]: true }))}
                onMouseLeave={() => setOpenGroups((current) => ({ ...current, [group]: false }))}
            >
                <Link
                    href={href}
                    className={cn(
                        'btn-ghost w-full justify-start relative z-10',
                        active ? GROUP_ACTIVE_CLASS : GROUP_INACTIVE_CLASS
                    )}
                    aria-expanded={isOpen}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group]: !isOpen }))}
                >
                    <span className="mr-2">{icon}</span>
                    <span className="flex-1 text-left">{label}</span>
                    <ChevronRight
                        size={14}
                        className={cn('transition-transform text-text-muted', isOpen && 'rotate-90')}
                    />
                </Link>

                <div
                    className={cn(
                        'transition-all duration-200 ease-in-out overflow-hidden',
                        isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                    )}
                >
                    <div className="pl-4 space-y-1 pt-1">{children}</div>
                </div>
            </div>
        );
    };

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
                    <Link
                        href="/dashboard"
                        className={cn(
                            'btn-ghost mb-2 w-full justify-start',
                            isDashboardActive ? GROUP_ACTIVE_CLASS : GROUP_INACTIVE_CLASS
                        )}
                    >
                        <span className="mr-2"><LayoutDashboard size={18} /></span>
                        {SHELL_MODULES.dashboard.label}
                    </Link>
                )}

                {canAccessModule('projects') && renderModuleGroup({
                    active: isProjectsActive,
                    group: 'projects',
                    href: getModulePath('projects', '/projects'),
                    icon: <FolderKanban size={18} />,
                    label: getModuleLabel('projects', 'Projects'),
                    children: (
                        <>
                            <div className="space-y-0.5">
                                {renderSubItem({
                                    href: '/projects',
                                    icon: <FolderKanban size={14} />,
                                    isActive: isExactPath(pathname, '/projects'),
                                    label: 'All Projects',
                                })}
                                {renderSubItem({
                                    href: '/projects/new',
                                    icon: <Plus size={14} />,
                                    isActive: isExactPath(pathname, '/projects/new'),
                                    label: 'New Project',
                                })}
                            </div>
                            <div className="space-y-0.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                                {projects.length === 0 ? (
                                    <p className="px-3 py-1.5 text-xs text-text-muted italic">
                                        No projects
                                    </p>
                                ) : (
                                    projects.map((project) => renderSubItem({
                                        href: `/projects/${project.id}`,
                                        isActive:
                                            pathname === `/projects/${project.id}` ||
                                            pathname === `/projects/${project.id}/edit`,
                                        label: project.title,
                                    }))
                                )}
                            </div>
                        </>
                    ),
                })}

                {canAccessModule('tickets') && renderModuleGroup({
                    active: isTicketsActive,
                    group: 'tickets',
                    href: getModulePath('tickets', '/tickets'),
                    icon: <Ticket size={18} />,
                    label: 'My Tickets',
                    children: (
                        <div className="space-y-0.5">
                            {renderSubItem({
                                href: '/tickets',
                                icon: <Ticket size={14} />,
                                isActive: isExactPath(pathname, '/tickets'),
                                label: 'View Tickets',
                            })}
                            {renderSubItem({
                                href: '/tickets/new',
                                icon: <Plus size={14} />,
                                isActive: isExactPath(pathname, '/tickets/new'),
                                label: 'Raise Ticket',
                            })}
                            {canManageAccess && renderSubItem({
                                href: '/tickets/manage',
                                icon: <Settings2 size={14} />,
                                isActive: isExactPath(pathname, '/tickets/manage'),
                                label: 'Manage Tickets',
                            })}
                        </div>
                    ),
                })}

                {canAccessModule('film_journal') && renderModuleGroup({
                    active: isFilmActive,
                    group: 'film',
                    href: getModulePath('film_journal', '/film'),
                    icon: <Film size={18} />,
                    label: getModuleLabel('film_journal', 'Film Journal'),
                    children: (
                        <div className="space-y-0.5">
                            {renderSubItem({
                                href: '/film/new-roll',
                                icon: <Plus size={14} />,
                                isActive: isExactPath(pathname, '/film/new-roll'),
                                label: 'Add Roll',
                            })}
                            {renderSubItem({
                                href: '/film/cameras',
                                icon: <Camera size={14} />,
                                isActive: isExactPath(pathname, '/film/cameras'),
                                label: 'Cameras',
                            })}
                            {renderSubItem({
                                href: '/film/dashboard',
                                icon: <BarChart3 size={14} />,
                                isActive: isExactPath(pathname, '/film/dashboard'),
                                label: 'Dashboard',
                            })}
                        </div>
                    ),
                })}

                {navModules.map((item) => (
                    <Link
                        key={item.slug}
                        href={item.path}
                        className={cn(
                            'btn-ghost w-full justify-start',
                            (item.slug === 'access_control' ? isAccessControlActive : pathname === item.path)
                                ? item.slug === 'logs' || item.slug === 'log_viewer'
                                    ? GROUP_ACTIVE_CLASS
                                    : 'bg-bg-hover text-text-primary'
                                : GROUP_INACTIVE_CLASS
                        )}
                    >
                        {item.icon && MODULE_ICONS[item.icon] && (
                            <span className="mr-2">{MODULE_ICONS[item.icon]}</span>
                        )}
                        {item.label}
                    </Link>
                ))}
            </nav>

            <div className="p-4 border-t border-border-subtle">
                <Link
                    href={SHELL_MODULES.settings.href}
                    className={cn(
                        'btn-ghost w-full justify-start',
                        pathname === '/settings'
                            ? 'bg-bg-hover text-text-primary'
                            : 'text-text-secondary'
                    )}
                >
                    <span className="mr-2"><Settings size={18} /></span>
                    {SHELL_MODULES.settings.label}
                </Link>
            </div>
        </aside>
    );
}
