'use client';

import { ComponentType, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    BookOpen,
    ClipboardList,
    FilePenLine,
    FolderKanban,
    LayoutDashboard,
    Settings,
} from 'lucide-react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { PageLoader } from '@/components/atoms/Loader';
import { AppModuleSlug, MODULE_LABELS, MODULE_PATHS } from '@/lib/rbac/constants';
import { Project } from '@/lib/types';

interface AccessPayload {
    allowed_modules: AppModuleSlug[];
}

const MODULE_CARD_META: Partial<
    Record<AppModuleSlug, { description: string; icon: ComponentType<{ size?: number; className?: string }> }>
> = {
    dashboard: {
        description: 'Your central workspace for navigating the app.',
        icon: LayoutDashboard,
    },
    projects: {
        description: 'Create, track, and update project records.',
        icon: FolderKanban,
    },
    logs: {
        description: 'Review and export weekly productivity logs.',
        icon: ClipboardList,
    },
    api: {
        description: 'Manage API keys and explore the available endpoints.',
        icon: BookOpen,
    },
    article_creation: {
        description: 'Use the article creation tools available to your role.',
        icon: FilePenLine,
    },
    settings: {
        description: 'Update your account details and access settings.',
        icon: Settings,
    },
};

export default function DashboardPage() {
    const [allowedModules, setAllowedModules] = useState<AppModuleSlug[]>(['dashboard', 'settings']);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadDashboard() {
            try {
                const accessRes = await fetch('/api/access/me');
                if (!accessRes.ok) {
                    throw new Error('Failed to load dashboard access');
                }

                const accessPayload = await accessRes.json();
                const modules = (accessPayload.data as AccessPayload).allowed_modules ?? ['dashboard', 'settings'];

                if (cancelled) return;
                setAllowedModules(modules);

                if (modules.includes('projects')) {
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

        loadDashboard();

        return () => {
            cancelled = true;
        };
    }, []);

    const quickLinks = useMemo(
        () =>
            allowedModules
                .filter((moduleSlug) => moduleSlug !== 'dashboard')
                .map((moduleSlug) => ({
                    ...MODULE_CARD_META[moduleSlug]!,
                    href: MODULE_PATHS[moduleSlug],
                    label: MODULE_LABELS[moduleSlug],
                    moduleSlug,
                })),
        [allowedModules]
    );

    if (isLoading) {
        return <PageLoader />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base">
                <p className="text-red-400 mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />

            <main className="flex-1 ml-64 p-8">
                <div className="max-w-5xl space-y-8">
                    <header className="space-y-3">
                        <h1 className="text-3xl font-heading font-medium">Dashboard</h1>
                        <p className="text-text-muted max-w-3xl">
                            This is your shared home screen. The cards below reflect the modules
                            currently available to your account.
                        </p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {quickLinks.map((item) => {
                            const Icon = item.icon;

                            return (
                                <Card key={item.moduleSlug} className="p-6 flex flex-col gap-4">
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
                                    <p className="text-sm text-text-secondary flex-1">
                                        {item.description}
                                    </p>
                                    <Link href={item.href}>
                                        <Button className="w-full">Open {item.label}</Button>
                                    </Link>
                                </Card>
                            );
                        })}
                    </div>

                    {!allowedModules.includes('projects') && (
                        <Card className="p-6">
                            <h2 className="text-lg font-semibold text-text-primary mb-2">
                                Projects Access
                            </h2>
                            <p className="text-sm text-text-secondary">
                                Your account does not currently include the Projects workspace. If
                                you need it, ask an access manager to grant the Projects module.
                            </p>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    );
}
