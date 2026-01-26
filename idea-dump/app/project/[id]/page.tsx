'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Project, Note, inferStatus, priorityConfig } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { NotesPanel } from '@/components/NotesPanel';
import { ArrowLeft, ExternalLink, Archive, Check, Pencil, FileText, Loader2, Trash2 } from 'lucide-react';

export default function ProjectPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (projectId) {
            fetchProject();
            fetchNotes();
        }
    }, [projectId]);

    const fetchProject = async () => {
        try {
            const response = await fetch('/api/projects');
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch project');
            }

            const foundProject = result.data?.find((p: Project) => p.id === projectId);
            if (foundProject) {
                setProject(foundProject);
            } else {
                setError('Project not found');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch project');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchNotes = async () => {
        try {
            const response = await fetch(`/api/notes?project_id=${projectId}`);
            const result = await response.json();

            if (response.ok) {
                setNotes(result.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch notes:', err);
        }
    };

    const handleAddNote = async (content: string) => {
        const response = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, content }),
        });

        if (response.ok) {
            fetchNotes();
        }
    };

    const handleToggleComplete = async () => {
        if (!project) return;

        const response = await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: projectId, completed: !project.completed }),
        });

        if (response.ok) {
            setProject({ ...project, completed: !project.completed });
        }
    };

    const handleToggleArchive = async () => {
        if (!project) return;

        const response = await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: projectId, archived: !project.archived }),
        });

        if (response.ok) {
            setProject({ ...project, archived: !project.archived });
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this project?')) return;

        const response = await fetch(`/api/projects?id=${projectId}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            router.push('/dashboard');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-rose)' }} />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="min-h-screen p-8 max-w-5xl mx-auto">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 mb-8"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowLeft size={20} />
                    Back to Dashboard
                </Link>
                <div
                    className="text-center py-16 p-6 rounded-lg"
                    style={{
                        background: 'var(--error-bg)',
                        border: '1px solid var(--error)'
                    }}
                >
                    <p style={{ color: 'var(--error)' }}>{error || 'Project not found'}</p>
                </div>
            </div>
        );
    }

    const status = inferStatus(project);

    return (
        <div className="min-h-screen p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowLeft size={20} />
                    Back to Dashboard
                </Link>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        onClick={handleToggleArchive}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Archive size={16} />
                        {project.archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                        onClick={handleDelete}
                        className="btn-secondary flex items-center gap-2"
                        style={{ color: 'var(--error)' }}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Project Header */}
            <div className="mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h1 style={{ color: 'var(--text-primary)' }}>{project.title}</h1>
                    <StatusBadge status={status} size="md" />
                </div>

                {project.description && (
                    <p
                        className="text-lg mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {project.description}
                    </p>
                )}

                {/* Meta Info */}
                <div
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)'
                    }}
                >
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Priority
                        </p>
                        <p className="font-medium" style={{ color: priorityConfig[project.priority].color }}>
                            {priorityConfig[project.priority].label}
                        </p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Created
                        </p>
                        <p style={{ color: 'var(--text-secondary)' }}>{formatDate(project.created_at)}</p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Updated
                        </p>
                        <p style={{ color: 'var(--text-secondary)' }}>{formatDate(project.updated_at)}</p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            GitHub
                        </p>
                        {project.github_url ? (
                            <a
                                href={project.github_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                                style={{ color: 'var(--accent-rose)' }}
                            >
                                <ExternalLink size={14} />
                                View Repo
                            </a>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>Not linked</p>
                        )}
                    </div>
                </div>

                {/* Tags */}
                {project.tags.length > 0 && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                        {project.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-sm px-3 py-1 rounded-full"
                                style={{
                                    background: 'var(--bg-hover)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Complete Toggle */}
                <button
                    onClick={handleToggleComplete}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                    style={{
                        background: project.completed ? 'var(--success-bg)' : 'var(--bg-hover)',
                        color: project.completed ? 'var(--status-complete)' : 'var(--text-secondary)'
                    }}
                >
                    <Check size={18} />
                    {project.completed ? 'Marked as Complete' : 'Mark as Complete'}
                </button>
            </div>

            {/* PRD Content */}
            {project.prd_content && (
                <section
                    className="mb-8 p-6 rounded-lg"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)'
                    }}
                >
                    <h2
                        className="text-xl font-semibold mb-4 flex items-center gap-2"
                        style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <FileText size={20} style={{ color: 'var(--accent-rose)' }} />
                        PRD
                    </h2>
                    <MarkdownRenderer content={project.prd_content} />
                </section>
            )}

            {/* Notes */}
            <section
                className="p-6 rounded-lg"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)'
                }}
            >
                <NotesPanel notes={notes} onAddNote={handleAddNote} />
            </section>
        </div>
    );
}
