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
                    <h1 className="text-2xl font-extrabold">Dashboard</h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {quickLinks.map((item) => {
                        const Icon = item.icon ? MODULE_ICONS[item.icon] : LayoutDashboard;

                        return (
                            <Link key={item.slug} href={item.path} className="block">
                                <Card className="border-2 border-border-dark p-6 flex h-full flex-col gap-4 transition-all duration-150 hover:-translate-y-1 hover:bg-bg-hover focus-within:-translate-y-1 focus-within:border-border-dark">
                                    <div className="flex items-center gap-3">
                                        <Icon size={20} className="text-text-primary" />
                                        <h2 className="font-mono text-base font-bold text-text-primary">
                                            {item.label}
                                        </h2>
                                    </div>
                                    <p className="font-mono text-sm leading-6 text-text-secondary flex-1">
                                        {item.description ?? 'Open this workspace module.'}
                                    </p>
                                    <div className="font-mono text-xs text-text-muted">
                                        &gt; OPEN{' '}
                                        <span className="inline-block w-[0.5em] animate-pulse">_</span>
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>

                {!allowedModules.includes('projects') && (
                    <Card className="p-6">
                        <h2 className="text-lg font-bold text-text-primary">
                            Projects Access
                        </h2>
                    </Card>
                )}
            </div>
        </AppShell>
    );
}
