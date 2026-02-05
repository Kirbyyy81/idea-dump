'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { PriorityBadge } from '@/components/molecules/PriorityBadge';
import { MarkdownRenderer } from '@/components/molecules/MarkdownRenderer';
import { NotesPanel } from '@/components/organisms/NotesPanel';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Project, Note, inferStatus } from '@/lib/types';
import {
    ArrowLeft,
    ExternalLink,
    Archive,
    Check,
    Pencil,
    FileText,
    Trash2
} from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import { cn, formatDate } from '@/lib/utils';

export default function ProjectPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Fetch project and notes
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                // Fetch project
                const projectRes = await fetch(`/api/projects?id=${projectId}`);
                if (!projectRes.ok) throw new Error('Failed to fetch project');
                const projectData = await projectRes.json();

                if (!projectData.data) {
                    throw new Error('Project not found');
                }

                setProject(projectData.data);

                // Fetch notes
                const notesRes = await fetch(`/api/notes?project_id=${projectId}`);
                if (notesRes.ok) {
                    const notesData = await notesRes.json();
                    setNotes(notesData.data || []);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [projectId]);

    const handleAddNote = async (content: string) => {
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId, content }),
            });

            if (!res.ok) throw new Error('Failed to add note');
            const { data } = await res.json();
            setNotes([data, ...notes]);
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    const handleUpdateProject = async (updates: Partial<Project>) => {
        if (!project) return;

        try {
            setIsUpdating(true);
            const res = await fetch('/api/projects', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: project.id, ...updates }),
            });

            if (!res.ok) throw new Error('Failed to update project');
            const { data } = await res.json();
            setProject(data);
        } catch (err) {
            console.error('Failed to update project:', err);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleToggleComplete = () => {
        handleUpdateProject({ completed: !project?.completed });
    };

    const handleToggleArchive = () => {
        handleUpdateProject({ archived: !project?.archived });
    };

    const handleDelete = async () => {
        if (!project || !confirm('Are you sure you want to delete this project?')) return;

        try {
            const res = await fetch(`/api/projects?id=${project.id}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Failed to delete project');
            router.push('/dashboard');
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    if (isLoading) {
        return <PageLoader />;
    }

    if (error || !project) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <p className="text-red-400 mb-4">{error || 'Project not found'}</p>
                <Link href="/dashboard" className="btn-secondary">
                    Back to Dashboard
                </Link>
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
                    className="flex items-center gap-2 transition-colors text-text-secondary hover:text-text-primary"
                >
                    <ArrowLeft size={20} />
                    Back to Dashboard
                </Link>
                <div className="flex gap-2">
                    <Link href={`/project/${project.id}/edit`}>
                        <Button variant="secondary" icon={<Pencil size={16} />}>
                            Edit
                        </Button>
                    </Link>
                    <Button
                        variant="secondary"
                        onClick={handleToggleArchive}
                        disabled={isUpdating}
                        icon={<Archive size={16} />}
                    >
                        {project.archived ? 'Unarchive' : 'Archive'}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-300 hover:bg-red-50"
                        icon={<Trash2 size={16} />}
                    >
                        Delete
                    </Button>
                </div>
            </div>

            {/* Project Header */}
            <div className="mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h1 className="text-text-primary text-3xl font-heading font-medium">{project.title}</h1>
                    <StatusBadge status={status} className="px-3 py-1 text-sm" />
                </div>

                {project.description && (
                    <p className="text-lg mb-6 text-text-secondary">
                        {project.description}
                    </p>
                )}

                {/* Meta Info */}
                <Card className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 !border-border-subtle bg-bg-elevated">
                    <div>
                        <PriorityBadge priority={project.priority} />
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">
                            Created
                        </p>
                        <p className="text-text-secondary">{formatDate(project.created_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">
                            Updated
                        </p>
                        <p className="text-text-secondary">{formatDate(project.updated_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">
                            GitHub
                        </p>
                        {project.github_url ? (
                            <a
                                href={project.github_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-accent-rose hover:underline"
                            >
                                <ExternalLink size={14} />
                                View Repo
                            </a>
                        ) : (
                            <p className="text-text-muted">Not linked</p>
                        )}
                    </div>
                </Card>

                {/* Complete Toggle */}
                <Button
                    onClick={handleToggleComplete}
                    disabled={isUpdating}
                    variant="ghost"
                    className={cn(
                        "mt-4 w-full md:w-auto justify-start",
                        project.completed
                            ? 'bg-success-bg text-status-complete hover:bg-success-bg/80'
                            : 'bg-bg-hover text-text-secondary hover:bg-bg-subtle'
                    )}
                    icon={<Check size={18} />}
                >
                    {project.completed ? 'Marked as Complete' : 'Mark as Complete'}
                </Button>
            </div>

            {/* PRD Content */}
            {project.prd_content && (
                <section className="mb-8">
                    <Card className="p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 font-body text-text-primary">
                            <FileText size={20} className="text-accent-rose" />
                            PRD
                        </h2>
                        <MarkdownRenderer content={project.prd_content} />
                    </Card>
                </section>
            )}

            {/* Notes */}
            <section>
                <Card className="p-6">
                    <NotesPanel notes={notes} onAddNote={handleAddNote} />
                </Card>
            </section>
        </div>
    );
}
