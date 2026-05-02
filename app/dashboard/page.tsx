'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ShieldCheck,
    BookOpen,
    ClipboardList,
    FilePenLine,
    FolderKanban,
    LayoutDashboard,
    LucideIcon,
    Settings,
    Ticket,
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

const MODULE_CARD_META: Partial<Record<AppModuleSlug, { description: string; icon: LucideIcon }>> = {
    dashboard: {
        description: 'Review your available modules and jump into the areas you can access.',
        icon: LayoutDashboard,
    },
    projects: {
        description: 'Manage project records and open individual project detail pages.',
        icon: FolderKanban,
    },
    logs: {
        description: 'View, add, edit, and export your weekly productivity logs.',
        icon: ClipboardList,
    },
    tickets: {
        description: 'Raise tickets, review your own queue, and manage ticket workflows across the workspace.',
        icon: Ticket,
    },
    api: {
        description: 'Manage API keys and review the API usage and documentation.',
        icon: BookOpen,
    },
    access_control: {
        description: 'Manage roles, module access, and user-specific exceptions.',
        icon: ShieldCheck,
    },
    article_creation: {
        description: 'Use the built-in helpers for article planning and content support.',
        icon: FilePenLine,
    },
    settings: {
        description: 'Manage your personal account settings and sign-out actions.',
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
                    <header>
                        <h1 className="text-3xl font-heading font-medium">Dashboard</h1>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {quickLinks.map((item) => {
                            const Icon = item.icon;

                            return (
                                <Link key={item.moduleSlug} href={item.href} className="block">
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
                                            {item.description}
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
            </main>
        </div>
    );
}
