'use client';

import { useState, useMemo, useEffect } from 'react';
import { Project, Status, inferStatus } from '@/lib/types';
import { ProjectCard } from '@/components/ProjectCard';
import { Sidebar } from '@/components/Sidebar';
import { SearchBar } from '@/components/SearchBar';
import { Search, Plus, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<Status | 'all'>('all');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Fetch projects from API
    useEffect(() => {
        async function fetchProjects() {
            try {
                setIsLoading(true);
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

    // Extract all unique tags
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        projects.forEach((p) => p.tags?.forEach((t) => tags.add(t)));
        return Array.from(tags).sort();
    }, [projects]);

    // Filter projects
    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesTitle = project.title.toLowerCase().includes(query);
                const matchesDesc = project.description?.toLowerCase().includes(query);
                if (!matchesTitle && !matchesDesc) return false;
            }

            // Status filter
            if (selectedStatus !== 'all') {
                if (inferStatus(project) !== selectedStatus) return false;
            }

            // Tag filter
            if (selectedTags.length > 0) {
                const hasAllTags = selectedTags.every((tag) => project.tags?.includes(tag));
                if (!hasAllTags) return false;
            }

            return true;
        });
    }, [projects, searchQuery, selectedStatus, selectedTags]);

    const handleTagToggle = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    return (
        <div className="min-h-screen">
            {/* Sidebar */}
            <Sidebar
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                selectedTags={selectedTags}
                onTagToggle={handleTagToggle}
                allTags={allTags}
            />

            {/* Main Content */}
            <main className="ml-64 p-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 style={{ color: 'var(--text-primary)' }}>Projects</h1>
                        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {isLoading ? 'Loading...' : `${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-80">
                            <SearchBar onSearch={setSearchQuery} />
                        </div>
                        <Link href="/project/new" className="btn-primary flex items-center gap-2">
                            <Plus size={18} />
                            New Project
                        </Link>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={32} className="animate-spin text-accent-rose" />
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="text-center py-16">
                        <p className="text-red-400 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="btn-secondary"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* Project Grid */}
                {!isLoading && !error && filteredProjects.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && filteredProjects.length === 0 && (
                    <div className="text-center py-16">
                        <div className="mb-4" style={{ color: 'var(--text-muted)' }}>
                            <Search size={48} />
                        </div>
                        <h3
                            className="text-lg font-semibold mb-2"
                            style={{
                                fontFamily: 'var(--font-body)',
                                color: 'var(--text-primary)'
                            }}
                        >
                            {projects.length === 0 ? 'No projects yet' : 'No projects found'}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            {projects.length === 0
                                ? 'Create your first project to get started'
                                : 'Try adjusting your search or filters'}
                        </p>
                        {projects.length === 0 && (
                            <Link href="/project/new" className="btn-primary inline-flex items-center gap-2 mt-4">
                                <Plus size={18} />
                                Create Project
                            </Link>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
