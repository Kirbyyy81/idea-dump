'use client';

import { useEffect, useState } from 'react';
import { Project } from '@/lib/types';
import { AppShell } from '@/components/organisms/AppShell';
import { MinuteReaderCard } from './_components/MinuteReaderCard';
import { SlugImageNameCard } from './_components/SlugImageNameCard';
import { TocAnchorGeneratorCard } from './_components/TocAnchorGeneratorCard';

export default function ArticleCreationPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok || cancelled) return;

                const data = await res.json();
                if (!cancelled) {
                    setProjects(data.data || []);
                }
            } catch {
                // Sidebar project list is best-effort only.
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <AppShell
            projects={projects}
            isLoading={isLoading}
            loadingMessage="Loading article creation tools..."
            pageTitle="Article Creation"
        >
            <div className="max-w-5xl space-y-8">
                <MinuteReaderCard />
                <SlugImageNameCard />
                <TocAnchorGeneratorCard />
            </div>
        </AppShell>
    );
}
