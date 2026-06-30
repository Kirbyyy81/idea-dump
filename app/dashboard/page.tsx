'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ShieldCheck,
    BookOpen,
    ClipboardList,
    FileSearch,
    FilePenLine,
    Film,
    FolderKanban,
    LayoutDashboard,
    LucideIcon,
    Settings,
    Ticket,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { AppModuleSlug } from '@/lib/rbac/constants';
import { PageLoader } from '@/components/atoms/Loader';
import { AppModuleMetadata } from '@/lib/rbac/types';
import { useAccess } from '@/lib/contexts/AccessContext';
import { Project } from '@/lib/types';
import { AppShell } from '@/components/organisms/AppShell';

const MODULE_ICONS: Record<string, LucideIcon> = {
    BookOpen,
    ClipboardList,
    FilePenLine,
    FileSearch,
    Film,
    FolderKanban,
    LayoutDashboard,
    Settings,
    ShieldCheck,
    Ticket,
};

export default function DashboardPage() {
    const access = useAccess();
    const allowedModules = useMemo(() => access?.allowedModules ?? ['dashboard', 'settings'], [access]);
    const modules = useMemo(() => access?.modules ?? [], [access]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadProjects() {
            try {
                if (allowedModules.includes('projects')) {
                    const projectsRes = await fetch('/api/projects');
                    if (projectsRes.ok && !cancelled) {
                        const projectsPayload = await projectsRes.json();
                        setProjects(projectsPayload.data || []);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load dashboard');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadProjects();

        return () => {
            cancelled = true;
        };
    }, [allowedModules]);

    const quickLinks = useMemo(
        () =>
            allowedModules
                .filter((moduleSlug) => moduleSlug !== 'dashboard')
                .map((moduleSlug) => modules.find((moduleRow) => moduleRow.slug === moduleSlug))
                .filter((moduleRow): moduleRow is AppModuleMetadata => Boolean(moduleRow))
                .filter((moduleRow) => moduleRow.path !== '/settings'),
        [allowedModules, modules]
    );

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base">
                <p className="text-error mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <AppShell projects={projects} isLoading={isLoading} loadingMessage="Loading dashboard...">
            <div className="max-w-5xl space-y-8">
                <header>
                    <h1 className="text-3xl font-heading font-medium">Dashboard</h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {quickLinks.map((item) => {
                        const Icon = item.icon ? MODULE_ICONS[item.icon] : LayoutDashboard;

                        return (
                            <Link key={item.slug} href={item.path} className="block">
                                <Card className="p-6 flex h-full flex-col gap-4 transition-colors hover:border-border-strong hover:bg-bg-hover/50 focus-within:border-border-strong">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-lg bg-accent-rose/10 p-3">
                                            <Icon size={20} className="text-accent-rose" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-text-primary">
                                                {item.label}
                                            </h2>
                                        </div>
                                    </div>
                                    <p className="text-sm leading-6 text-text-secondary">
                                        {item.description ?? 'Open this workspace module.'}
                                    </p>
                                </Card>
                            </Link>
                        );
                    })}
                </div>

                {!allowedModules.includes('projects') && (
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-text-primary">
                            Projects Access
                        </h2>
                    </Card>
                )}
            </div>
        </AppShell>
    );
}
