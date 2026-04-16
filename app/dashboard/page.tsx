'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/organisms/Sidebar';
import { ProjectCard } from '@/components/organisms/ProjectCard';
import { Project, Status, statusConfig, inferStatus } from '@/lib/types';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';
import { iconMap } from '@/lib/icons';
import { PageLoader } from '@/components/atoms/Loader';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<Status | 'all'>('all');

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
        return projects.filter(project => {
            // Search filter
            const matchesSearch = searchQuery === '' ||
                project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                project.description?.toLowerCase().includes(searchQuery.toLowerCase());

            // Status filter
            const projectStatus = inferStatus(project);
            const matchesStatus = selectedStatus === 'all' || projectStatus === selectedStatus;

            return matchesSearch && matchesStatus;
        });
    }, [projects, searchQuery, selectedStatus]);

    // Status counts for filter badges
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { all: projects.length };
        projects.forEach(p => {
            const status = inferStatus(p);
            counts[status] = (counts[status] || 0) + 1;
        });
        return counts;
    }, [projects]);

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
                {/* Header */}
                <header className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-heading font-medium">My Projects</h1>
                    <Link href="/project/new">
                        <Button icon={<Plus size={18} />}>
                            New Project
                        </Button>
                    </Link>
                </header>

                {/* Filter Bar */}
                <div className="mb-6 space-y-4">
                    {/* Search */}
                    <div className="relative max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input w-full pl-10 pr-10"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Status Filter */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedStatus('all')}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                selectedStatus === 'all'
                                    ? "bg-accent-rose text-white"
                                    : "bg-bg-hover text-text-secondary hover:bg-bg-subtle"
                            )}
                        >
                            All ({statusCounts.all || 0})
                        </button>
                        {(Object.keys(statusConfig) as Status[]).map((status) => {
                            const config = statusConfig[status];
                            const IconComponent = iconMap[config.icon];
                            const count = statusCounts[status] || 0;

                            return (
                                <button
                                    key={status}
                                    onClick={() => setSelectedStatus(status)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5",
                                        selectedStatus === status
                                            ? "bg-accent-rose text-white"
                                            : "bg-bg-hover text-text-secondary hover:bg-bg-subtle"
                                    )}
                                >
                                    {IconComponent && <IconComponent size={14} />}
                                    {config.label} ({count})
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Projects Grid */}
                {filteredProjects.length === 0 ? (
                    <div className="text-center py-12 text-text-muted">
                        {projects.length === 0 ? (
                            <>
                                <p>No projects yet.</p>
                                <p className="mt-2">Create your first project to get started!</p>
                            </>
                        ) : (
                            <>
                                <p>No projects match your filters.</p>
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedStatus('all');
                                    }}
                                    className="mt-2 text-accent-rose hover:underline"
                                >
                                    Clear filters
                                </button>
                            </>
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
