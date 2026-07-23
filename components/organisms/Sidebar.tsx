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
import { CategoryDoodleIcon, SourceDoodleIcon } from '@/components/atoms/DoodleIcons';
import {
    BarChart3,
    BookOpen,
    Camera,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    FilePenLine,
    FileSearch,
    Film,
    FolderKanban,
    Landmark,
    LayoutDashboard,
    PanelLeftClose,
    Plus,
    ReceiptText,
    Settings,
    Settings2,
    ShieldCheck,
    Ticket,
} from 'lucide-react';

interface SidebarProps {
    projects: Project[];
    collapsed?: boolean;
    className?: string;
    onToggleCollapsed?: () => void;
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
    Landmark: <Landmark size={18} />,
    ShieldCheck: <ShieldCheck size={18} />,
    Ticket: <Ticket size={18} />,
};

const NAV_ITEM_CLASS =
    'flex min-h-10 w-full items-center gap-2 rounded-sm border border-transparent px-3 py-2 text-left text-[12px] font-semibold leading-normal transition-colors';
const NAV_SUBITEM_CLASS =
    'flex min-h-10 w-full items-center gap-2 rounded-sm border border-transparent px-3 py-1.5 text-left text-[12px] font-medium leading-normal transition-colors';
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

function isFinanceRoute(pathname: string) {
    return pathname === '/finance' || pathname.startsWith('/finance/');
}

export function Sidebar({ projects, collapsed = false, className, onToggleCollapsed }: SidebarProps) {
    const pathname = usePathname();
    const [openGroups, setOpenGroups] = useState<Partial<Record<'projects' | 'tickets' | 'film' | 'finance', boolean>>>({});
    const access = useAccess();
    const allowedModules = access?.allowedModules ?? [];
    const modules = access?.modules ?? [];
    const canManageAccess = access?.canManageAccess ?? false;

    const canAccessModule = (moduleSlug: AppModuleSlug) => allowedModules.includes(moduleSlug);
    const isDashboardActive = pathname === '/' || pathname.startsWith('/dashboard');
    const isProjectsActive = isProjectRoute(pathname);
    const isTicketsActive = pathname === '/tickets' || pathname.startsWith('/tickets/');
    const isFilmActive = isFilmRoute(pathname);
    const isFinanceActive = isFinanceRoute(pathname);
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
        moduleRow.slug !== 'finance' &&
        canAccessModule(moduleRow.slug)
    );

    const renderSubItem = ({ href, icon, isActive, label }: SidebarSubItem) => (
        <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
                NAV_SUBITEM_CLASS,
                collapsed && 'justify-center px-2',
                isActive ? SUBITEM_ACTIVE_CLASS : SUBITEM_INACTIVE_CLASS
            )}
        >
            {icon && <span className="grid size-4 shrink-0 place-items-center">{icon}</span>}
            {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
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
            title={collapsed ? label : undefined}
            className={cn(
                NAV_ITEM_CLASS,
                collapsed && 'justify-center px-2',
                active ? GROUP_ACTIVE_CLASS : GROUP_INACTIVE_CLASS
            )}
        >
            <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
            {!collapsed && <span className="min-w-0 flex-1 text-left truncate">{label}</span>}
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
        group: 'projects' | 'tickets' | 'film' | 'finance';
        href: string;
        icon: JSX.Element;
        label: string;
    }) => {
        const isOpen = Boolean(openGroups[group] || active);
        const submenuId = `sidebar-${group}-submenu`;

        if (collapsed) {
            return renderModuleLink({ active, href, icon, label });
        }

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
                    aria-controls={submenuId}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group]: !isOpen }))}
                >
                    <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
                    <span className="min-w-0 flex-1 text-left truncate">{label}</span>
                    <ChevronRight
                        size={14}
                        className={cn('shrink-0 transition-transform text-nav-text-muted', isOpen && 'rotate-90')}
                    />
                </Link>

                {isOpen && (
                    <div id={submenuId}>
                        <div className="space-y-0.5 pl-4 pt-0.5">{children}</div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside
            className={cn(
                'nav-shell sticky top-3 flex h-[calc(100dvh-24px)] max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-lg bg-nav-bg text-nav-text',
                collapsed ? 'px-2 py-3' : 'px-[14px] py-[18px]',
                className
            )}
        >
            <div className={cn('border-b border-nav-bg-hover pb-4', collapsed && 'pb-3')}>
                <div className={cn('flex gap-2', collapsed ? 'flex-col items-center' : 'items-center justify-between')}>
                    {collapsed && onToggleCollapsed ? (
                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            className="grid size-9 place-items-center rounded-sm text-nav-text-muted transition-colors hover:bg-nav-bg-hover hover:text-nav-text"
                            aria-label="Expand sidebar"
                            aria-expanded={false}
                            title="Expand sidebar"
                        >
                            <Image
                                src="/logo.png"
                                alt=""
                                width={28}
                                height={28}
                                className="size-7 shrink-0 object-contain"
                            />
                        </button>
                    ) : (
                        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
                            <Image
                                src="/logo.png"
                                alt="IdeaDump Logo"
                                width={28}
                                height={28}
                                className="size-7 shrink-0 object-contain"
                            />
                            <span className="truncate font-heading text-base font-extrabold leading-none text-nav-text">
                                IdeaDump
                            </span>
                        </Link>
                    )}
                    {onToggleCollapsed && !collapsed && (
                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            className="grid size-8 shrink-0 place-items-center rounded-sm text-nav-text-muted transition-colors hover:bg-nav-bg-hover hover:text-nav-text"
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-expanded={!collapsed}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <PanelLeftClose size={17} />
                        </button>
                    )}
                </div>
            </div>

            <nav className={cn('custom-scrollbar-nav flex-1 space-y-1 overflow-y-auto py-4', collapsed && 'py-3')}>
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

                {canAccessModule('finance') && renderModuleGroup({
                    active: isFinanceActive,
                    group: 'finance',
                    href: getModulePath('finance', '/finance'),
                    icon: <Landmark size={18} />,
                    label: getModuleLabel('finance', 'Finance'),
                    children: (
                        <div className="space-y-0.5">
                            {renderSubItem({
                                href: '/finance/transactions',
                                icon: <ReceiptText size={14} />,
                                isActive: isExactPath(pathname, '/finance/transactions'),
                                label: 'Transactions',
                            })}
                            {renderSubItem({
                                href: '/finance/review',
                                icon: <ClipboardCheck size={14} />,
                                isActive: isExactPath(pathname, '/finance/review'),
                                label: 'Review',
                            })}
                            {renderSubItem({
                                href: '/finance/sources',
                                icon: <SourceDoodleIcon className="size-4" />,
                                isActive: isExactPath(pathname, '/finance/sources'),
                                label: 'Sources',
                            })}
                            {renderSubItem({
                                href: '/finance/categories',
                                icon: <CategoryDoodleIcon className="size-4" />,
                                isActive: isExactPath(pathname, '/finance/categories'),
                                label: 'Categories',
                            })}
                            {renderSubItem({
                                href: '/finance/rules',
                                icon: <Settings2 size={14} />,
                                isActive: isExactPath(pathname, '/finance/rules'),
                                label: 'Rules',
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
