'use client';

import { useState, useEffect, useMemo } from 'react';
import { Project, Status, inferStatus } from '@/lib/types';
import { ProjectCard } from '@/components/ProjectCard';
import { Sidebar } from '@/components/Sidebar';
import { SearchBar } from '@/components/SearchBar';
import { Search, Loader2, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<Status | 'all'>('all');

    const [showNewModal, setShowNewModal] = useState(false);

    // Fetch projects on mount
    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/projects');
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch projects');
            }

            setProjects(result.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch projects');
        } finally {
            setIsLoading(false);
        }
    };

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

            return true;
        });
    }, [projects, searchQuery, selectedStatus]);

    return (
        <div className="min-h-screen">
            {/* Sidebar */}
            <Sidebar
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}

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
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <Plus size={18} />
                            New Project
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-rose)' }} />
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div
                        className="text-center py-16 p-6 rounded-lg"
                        style={{
                            background: 'var(--error-bg)',
                            border: '1px solid var(--error)'
                        }}
                    >
                        <p style={{ color: 'var(--error)' }}>{error}</p>
                        <button
                            onClick={fetchProjects}
                            className="btn-secondary mt-4"
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
                                : 'Try adjusting your search or filters'
                            }
                        </p>
                        {projects.length === 0 && (
                            <button
                                onClick={() => setShowNewModal(true)}
                                className="btn-primary mt-4"
                            >
                                Create Project
                            </button>
                        )}
                    </div>
                )}
            </main>

            {/* New Project Modal */}
            {showNewModal && (
                <NewProjectModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={() => {
                        setShowNewModal(false);
                        fetchProjects();
                    }}
                />
            )}
        </div>
    );
}

// New Project Modal Component
function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create project');
            }

            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-md p-6 rounded-xl"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                        New Project
                    </h2>
                    <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="title"
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            Title *
                        </label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="My awesome project"
                            required
                            className="input"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="description"
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            Description
                        </label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this project about?"
                            rows={3}
                            className="input resize-none"
                        />
                    </div>

                    {error && (
                        <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
                    )}

                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSubmitting || !title.trim()}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Project'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
