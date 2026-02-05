'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { ProjectCard } from '@/components/organisms/ProjectCard';
import { Project } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch projects
    useEffect(() => {
        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok) throw new Error('Failed to fetch projects');
                const { data } = await res.json();
                setProjects(data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchProjects();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg-base">
                <Loader2 size={32} className="animate-spin text-accent-rose" />
            </div>
        );
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
                {/* Header */}
                <header className="mb-8">
                    <h1 className="text-3xl font-heading font-medium">My Projects</h1>
                </header>

                {/* Projects Grid */}
                {projects.length === 0 ? (
                    <div className="text-center py-12 text-text-muted">
                        <p>No projects yet.</p>
                        <p className="mt-2">Create your first project to get started!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {projects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
