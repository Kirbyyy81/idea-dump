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

const NAV_ITEM_CLASS =
    'flex min-h-10 w-full items-center gap-2 rounded-sm border border-transparent px-3 py-2 text-left text-[12px] font-semibold leading-none transition-colors';
const NAV_SUBITEM_CLASS =
    'flex min-h-9 w-full items-center gap-2 rounded-sm border border-transparent px-3 py-2 text-left text-[12px] font-medium leading-none transition-colors';
const GROUP_ACTIVE_CLASS = 'bg-nav-bg-hover text-nav-text hover:bg-nav-bg-hover hover:text-nav-text';
const GROUP_INACTIVE_CLASS = 'text-nav-text-muted hover:bg-nav-bg-hover hover:text-nav-text';
const SUBITEM_ACTIVE_CLASS =
    'border-l-2 border-l-nav-text bg-nav-bg-hover text-nav-text hover:bg-nav-bg-hover hover:text-nav-text';
const SUBITEM_INACTIVE_CLASS = 'text-nav-text-muted hover:bg-nav-bg-hover hover:text-nav-text';

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
        moduleSlug === 'api' ? 'API Docs' : moduleBySlug.get(moduleSlug)?.label ?? fallback;
    const getModulePath = (moduleSlug: AppModuleSlug, fallback: string) =>
        moduleSlug === 'api' ? '/docs' : moduleBySlug.get(moduleSlug)?.path ?? fallback;
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
                NAV_SUBITEM_CLASS,
                isActive ? SUBITEM_ACTIVE_CLASS : SUBITEM_INACTIVE_CLASS
            )}
        >
            {icon && <span className="grid size-4 shrink-0 place-items-center">{icon}</span>}
            <span className="truncate">{label}</span>
        </Link>
    );

    const renderModuleLink = ({
        active,
        href,
        icon,
        label,
    }: {
        active: boolean;
        href: string;
        icon: JSX.Element;
        label: string;
    }) => (
        <Link
            href={href}
            className={cn(
                NAV_ITEM_CLASS,
                active ? GROUP_ACTIVE_CLASS : GROUP_INACTIVE_CLASS
            )}
        >
            <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
            <span className="flex-1 text-left truncate">{label}</span>
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
                className="space-y-1"
                onMouseEnter={() => setOpenGroups((current) => ({ ...current, [group]: true }))}
                onMouseLeave={() => setOpenGroups((current) => ({ ...current, [group]: false }))}
            >
                <Link
                    href={href}
                    className={cn(
                        NAV_ITEM_CLASS,
                        active ? GROUP_ACTIVE_CLASS : GROUP_INACTIVE_CLASS
                    )}
                    aria-expanded={isOpen}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group]: !isOpen }))}
                >
                    <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
                    <span className="flex-1 text-left">{label}</span>
                    <ChevronRight
                        size={14}
                        className={cn('transition-transform text-nav-text-muted', isOpen && 'rotate-90')}
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
        <aside className="flex min-h-full flex-col rounded-lg bg-nav-bg px-[14px] py-[18px] text-nav-text">
            <div className="border-b border-nav-bg-hover pb-4">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Image
                        src="/logo.png"
                        alt="IdeaDump Logo"
                        width={28}
                        height={28}
                        className="size-7 object-contain"
                    />
                    <span className="font-heading text-base font-extrabold leading-none text-nav-text">
                        IdeaDump
                    </span>
                </Link>
            </div>

            <nav className="custom-scrollbar-nav flex-1 space-y-1 overflow-y-auto py-4">
                {canAccessModule('dashboard') && (
                    renderModuleLink({
                        active: isDashboardActive,
                        href: '/dashboard',
                        icon: <LayoutDashboard size={18} />,
                        label: SHELL_MODULES.dashboard.label,
                    })
                )}

                {canAccessModule('projects') && renderModuleGroup({
                    active: isProjectsActive,
                    group: 'projects',
                    href: getModulePath('projects', '/projects'),
                    icon: <FolderKanban size={18} />,
                    label: getModuleLabel('projects', 'Projects'),
                    children: (
                        <>
                            <div className="custom-scrollbar-nav max-h-[260px] space-y-1 overflow-y-auto">
                                {projects.length === 0 ? (
                                    <p className="px-3 py-2 text-[12px] italic leading-none text-nav-text-muted">
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
                    label: 'Tickets',
                    children: (
                        <div className="space-y-0.5">
                            {renderSubItem({
                                href: '/tickets',
                                icon: <Ticket size={14} />,
                                isActive: isExactPath(pathname, '/tickets'),
                                label: 'My Tickets',
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

                {navModules.map((item) => {
                    const itemPath = getModulePath(item.slug, item.path);
                    return (
                    <div key={item.slug}>
                        {renderModuleLink({
                            active: item.slug === 'access_control' ? isAccessControlActive : pathname === itemPath,
                            href: itemPath,
                            icon: item.icon && MODULE_ICONS[item.icon]
                                ? MODULE_ICONS[item.icon]
                                : <LayoutDashboard size={18} />,
                            label: getModuleLabel(item.slug, item.label),
                        })}
                    </div>
                );
                })}
            </nav>

            <div className="border-t border-nav-bg-hover pt-4">
                {renderModuleLink({
                    active: pathname === '/settings',
                    href: SHELL_MODULES.settings.href,
                    icon: <Settings size={18} />,
                    label: SHELL_MODULES.settings.label,
                })}
            </div>
        </aside>
    );
}
