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
    Search,
    ChevronRight,
    ClipboardList,
    BookOpen,
    FilePenLine,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';

interface SidebarProps {
    projects: Project[];
}

const DEFAULT_ALLOWED_MODULES: AppModuleSlug[] = ['dashboard', 'settings'];

const MODULE_NAV_ITEMS: Array<{ href: string; icon: JSX.Element; module: AppModuleSlug }> = [
    { href: '/logs', icon: <ClipboardList size={18} />, module: 'logs' },
    { href: '/api-tools', icon: <BookOpen size={18} />, module: 'api' },
    { href: '/settings/access', icon: <ShieldCheck size={18} />, module: 'access_control' },
    { href: '/article-creation', icon: <FilePenLine size={18} />, module: 'article_creation' },
];

export function Sidebar({ projects }: SidebarProps) {
    const pathname = usePathname();
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [allowedModules, setAllowedModules] = useState<AppModuleSlug[]>(DEFAULT_ALLOWED_MODULES);

    const filteredProjects = projects.filter((p) =>
        p.title.toLowerCase().includes(projectSearch.toLowerCase())
    );

    useEffect(() => {
        let cancelled = false;

        async function loadAccess() {
            try {
                const res = await fetch('/api/access/me');
                if (!res.ok) return;

                const payload = await res.json();
                if (!cancelled && payload.data?.allowed_modules) {
                    setAllowedModules(payload.data.allowed_modules);
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
                                {filteredProjects.length > 0 && (
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
                                <div className="px-2 mb-2">
                                    <div className="relative">
                                        <Search
                                            size={12}
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                                        />
                                        <Input
                                            type="text"
                                            placeholder="Find..."
                                            value={projectSearch}
                                            onChange={(e) => setProjectSearch(e.target.value)}
                                            className="w-full pl-7 pr-2 py-1 text-xs h-7 bg-bg-base border border-border-subtle rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-rose"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {filteredProjects.length === 0 ? (
                                        <p className="px-3 py-1.5 text-xs text-text-muted italic">
                                            {projects.length === 0 ? 'No projects' : 'No matches'}
                                        </p>
                                    ) : (
                                        filteredProjects.map((project) => (
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

                {MODULE_NAV_ITEMS.filter((item) => canAccessModule(item.module)).map((item) => (
                    <Link key={item.module} href={item.href} className="block">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start',
                                (item.module === 'access_control'
                                    ? isAccessControlActive
                                    : pathname === item.href)
                                    ? item.module === 'logs'
                                        ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose'
                                        : 'bg-bg-hover text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                            icon={item.icon}
                        >
                            {MODULE_LABELS[item.module]}
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
