'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { LoaderOne } from '@/components/atoms/Loader';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AppShellProps extends PropsWithChildren {
    contentClassName?: string;
    projects?: Project[];
    isLoading?: boolean;
    loadingMessage?: string;
}

export function AppShell({ children, contentClassName = 'p-5 md:p-6', projects: externalProjects, isLoading, loadingMessage }: AppShellProps) {
    const [internalProjects, setInternalProjects] = useState<Project[]>([]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Only fetch projects internally if external projects not provided
    useEffect(() => {
        // Skip fetching if projects provided externally
        if (externalProjects !== undefined) {
            return;
        }

        let cancelled = false;

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok || cancelled) return;

                const payload = await res.json();
                if (!cancelled) {
                    setInternalProjects(payload.data || []);
                }
            } catch {
                // Project navigation is best-effort when the user lacks Projects access.
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, [externalProjects]);

    // Use external projects if provided, otherwise use internal projects
    const projects = externalProjects !== undefined ? externalProjects : internalProjects;

    return (
        <div className="min-h-screen bg-bg-canvas p-1 font-body text-text-primary md:p-3">
            <div
                className={cn(
                    'mx-auto grid max-w-[1540px] min-h-[calc(100vh-24px)] items-start gap-3 rounded-shell border-2 border-border-strong bg-bg-shell p-3 transition-[grid-template-columns]',
                    isSidebarCollapsed
                        ? 'grid-cols-[64px_minmax(0,1fr)]'
                        : 'grid-cols-[224px_minmax(0,1fr)]'
                )}
            >
                <Sidebar
                    projects={projects}
                    collapsed={isSidebarCollapsed}
                    onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
                />
                <main className={`min-w-0 ${contentClassName}`}>
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <LoaderOne size="lg" />
                            {loadingMessage && (
                                <p className="text-text-muted text-sm animate-pulse">{loadingMessage}</p>
                            )}
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>
        </div>
    );
}
