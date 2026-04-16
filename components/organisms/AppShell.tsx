'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Project } from '@/lib/types';

interface AppShellProps extends PropsWithChildren {
    contentClassName?: string;
}

export function AppShell({ children, contentClassName = 'p-8' }: AppShellProps) {
    const [projects, setProjects] = useState<Project[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok || cancelled) return;

                const payload = await res.json();
                if (!cancelled) {
                    setProjects(payload.data || []);
                }
            } catch {
                // Project navigation is best-effort when the user lacks Projects access.
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />
            <main className={`flex-1 ml-64 ${contentClassName}`}>{children}</main>
        </div>
    );
}
