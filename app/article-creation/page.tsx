'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/atoms/Card';
import { Project } from '@/lib/types';
import { AppShell } from '@/components/organisms/AppShell';
import { FilePenLine } from 'lucide-react';
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
        <AppShell projects={projects} isLoading={isLoading} loadingMessage="Loading article creation tools...">
            <div className="max-w-5xl space-y-8">
                <header className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div>
                            <h1 className="text-3xl font-heading font-medium">
                                Article Creation
                            </h1>
                        </div>
                    </div>
                </header>

                <MinuteReaderCard />
                <SlugImageNameCard />
                <TocAnchorGeneratorCard />
            </div>
        </AppShell>
    );
}
