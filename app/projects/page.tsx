'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/organisms/AppShell';
import { ProjectCard } from './_components/ProjectCard';
import { Project, Status, statusConfig, inferStatus } from '@/lib/types';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { cn } from '@/lib/utils';
import { iconMap } from '@/lib/projects/icons';
import { listProjects } from '@/lib/projects/client';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
    const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
    const statusFilterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function fetchProjects() {
            try {
                setProjects(await listProjects());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }

        fetchProjects();
    }, []);

    useEffect(() => {
        if (!isStatusFilterOpen) return;

        function handlePointerDown(event: PointerEvent) {
            if (!statusFilterRef.current?.contains(event.target as Node)) {
                setIsStatusFilterOpen(false);
            }
        }

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isStatusFilterOpen]);

    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            const matchesSearch =
                searchQuery === '' ||
                project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                project.description?.toLowerCase().includes(searchQuery.toLowerCase());

            const projectStatus = inferStatus(project);
            const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(projectStatus);

            return matchesSearch && matchesStatus;
        });
    }, [projects, searchQuery, selectedStatuses]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { all: projects.length };
        projects.forEach((project) => {
            const status = inferStatus(project);
            counts[status] = (counts[status] || 0) + 1;
        });
        return counts;
    }, [projects]);

    const statusFilterLabel = useMemo(() => {
        if (selectedStatuses.length === 0) return `All statuses (${projects.length})`;
        if (selectedStatuses.length === 1) {
            const status = selectedStatuses[0];
            return `${statusConfig[status].label} (${statusCounts[status] || 0})`;
        }
        return `${selectedStatuses.length} statuses selected`;
    }, [projects.length, selectedStatuses, statusCounts]);

    const toggleStatus = (status: Status) => {
        setSelectedStatuses((current) =>
            current.includes(status)
                ? current.filter((item) => item !== status)
                : [...current, status]
        );
    };

    if (error) {
        return (
            <AppShell contentClassName="p-5 md:p-8">
                <div className="flex min-h-[60vh] flex-col items-center justify-center">
                    <p className="text-error mb-4">{error}</p>
                    <Button onClick={() => window.location.reload()}>
                        Retry
                    </Button>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            projects={projects}
            isLoading={isLoading}
            loadingMessage="Loading projects..."
            pageTitle="Projects"
            headerAction={
                <Link href="/projects/new" className="shrink-0">
                    <Button icon={<Plus size={18} />} className="h-10 px-4">
                        New Project
                    </Button>
                </Link>
            }
        >
            <div>
                <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="relative min-w-0">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input w-full pl-10 pr-10"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                                aria-label="Clear search"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <div ref={statusFilterRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setIsStatusFilterOpen((current) => !current)}
                            aria-haspopup="listbox"
                            aria-expanded={isStatusFilterOpen}
                            className="input flex h-10 items-center justify-between gap-3 pr-10 text-left"
                        >
                            <span className="truncate">{statusFilterLabel}</span>
                            <ChevronDown
                                size={16}
                                className={cn(
                                    'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-transform',
                                    isStatusFilterOpen && 'rotate-180'
                                )}
                            />
                        </button>

                        {isStatusFilterOpen && (
                            <div
                                role="listbox"
                                aria-multiselectable="true"
                                className="absolute right-0 z-20 mt-2 w-full overflow-hidden rounded-md border border-border-default bg-bg-elevated py-1 text-sm shadow-subtle"
                            >
                                <button
                                    type="button"
                                    onClick={() => setSelectedStatuses([])}
                                    className={cn(
                                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-subtle',
                                        selectedStatuses.length === 0 ? 'text-text-primary' : 'text-text-secondary'
                                    )}
                                    role="option"
                                    aria-selected={selectedStatuses.length === 0}
                                >
                                    <span>All statuses ({statusCounts.all || 0})</span>
                                    {selectedStatuses.length === 0 && <Check size={14} className="text-accent-rose" />}
                                </button>

                                {(Object.keys(statusConfig) as Status[]).map((status) => {
                                    const config = statusConfig[status];
                                    const IconComponent = iconMap[config.icon];
                                    const count = statusCounts[status] || 0;
                                    const isSelected = selectedStatuses.includes(status);

                                    return (
                                        <button
                                            key={status}
                                            type="button"
                                            onClick={() => toggleStatus(status)}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-subtle',
                                                isSelected ? 'bg-bg-hover text-text-primary' : 'text-text-secondary'
                                            )}
                                            role="option"
                                            aria-selected={isSelected}
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                {IconComponent && <IconComponent size={14} className="shrink-0" />}
                                                <span className="truncate">{config.label} ({count})</span>
                                            </span>
                                            {isSelected && <Check size={14} className="shrink-0 text-accent-rose" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {filteredProjects.length === 0 ? (
                    <div className="text-center py-12 text-text-muted">
                        {projects.length === 0 ? (
                            <>
                                <p>No projects yet.</p>
                                <p className="mt-2">Create your first project to get started.</p>
                            </>
                        ) : (
                            <>
                                <p>No projects match your filters.</p>
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedStatuses([]);
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
            </div>
        </AppShell>
    );
}
