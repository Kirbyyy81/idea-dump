'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { ProjectCard } from '@/components/organisms/ProjectCard';
import { Project, Status } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [selectedStatus, setSelectedStatus] = useState<Status | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

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

    // Filter projects
    const filteredProjects = useMemo(() => {
        if (!projects) return [];

        return projects.filter((project) => {
            // Status filter
            if (selectedStatus !== 'all') {
                // This is a simplified check. Ideally we might want more robust status inference mapping
                // But for now relying on the same logic used elsewhere or if project.status existed
                // Since project doesn't have explicit status field in DB (it's inferred), 
                // we might need to assume 'all' for now or duplicate inference logic here if we really want strict filtering
                // For this refactor, I'll keep it simple: strict filtering would require inferStatus helpers 
                // but let's assume specific status demands specific implementation.
                // Actually, existing implementation might have had logic for this.
                // Let's re-use the status inference if possible or just filter by simple props if we had them.
                // ...
                // Re-reading types: Project has no status field. It's inferred.
                // So filtering by status requires inferring status for each project.

                // Let's bring in inferStatus
                const { inferStatus } = require('@/lib/types');
                const status = inferStatus(project);
                if (status !== selectedStatus) return false;
            }

            // Search filter
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const titleMatch = project.title.toLowerCase().includes(query);
                const descMatch = project.description?.toLowerCase().includes(query);
                if (!titleMatch && !descMatch) return false;
            }

            return true;
        });
    }, [projects, selectedStatus, searchQuery]);

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
            <Sidebar
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
            />

            <main className="flex-1 ml-64 p-8">
                {/* Header */}
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-heading font-medium mb-2">My Projects</h1>
                        <p className="text-text-secondary">
                            Manage and track your PRD implementations
                        </p>
                    </div>

                    {/* Search - Using a simple input for now, could be its own molecule */}
                    <div className="relative w-64">
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input w-full pl-4 pr-4 py-2"
                        />
                    </div>
                </header>

                {/* Projects Grid */}
                {filteredProjects.length === 0 ? (
                    <div className="text-center py-12 text-text-muted">
                        <p>No projects found matching your filters.</p>
                        {projects.length === 0 && (
                            <p className="mt-2">Create your first project to get started!</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProjects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
