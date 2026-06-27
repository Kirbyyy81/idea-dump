'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { LoaderOne } from '@/components/atoms/Loader';
import { Project } from '@/lib/types';

interface AppShellProps extends PropsWithChildren {
    contentClassName?: string;
    projects?: Project[];
    isLoading?: boolean;
    loadingMessage?: string;
}

export function AppShell({ children, contentClassName = 'p-8', projects: externalProjects, isLoading, loadingMessage }: AppShellProps) {
    const [internalProjects, setInternalProjects] = useState<Project[]>([]);

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
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />
            <main className={`flex-1 ml-64 ${contentClassName}`}>
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
    );
}
