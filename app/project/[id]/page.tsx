'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '../_components/StatusBadge';
import { PriorityBadge } from '../_components/PriorityBadge';
import { MarkdownRenderer } from '../_components/MarkdownRenderer';
import { NotesPanel } from '../_components/NotesPanel';
import { TicketCard } from '@/components/organisms/TicketCard';
import { TicketForm } from '@/components/organisms/TicketForm';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { CreateTicketInput, Note, Project, Ticket, inferStatus } from '@/lib/types';
import {
    ArrowLeft,
    ExternalLink,
    Archive,
    Pencil,
    FileText,
    Rocket,
    Ticket as TicketIcon,
    Trash2,
    Plus,
} from 'lucide-react';
import { PageLoader } from '@/components/atoms/Loader';
import { formatDate } from '@/lib/utils';

export default function ProjectPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [showTicketForm, setShowTicketForm] = useState(false);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [isSavingTicket, setIsSavingTicket] = useState(false);
    const [canAccessTickets, setCanAccessTickets] = useState(false);
    const [canManageTickets, setCanManageTickets] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                const accessRes = await fetch('/api/access/me');
                let nextCanAccessTickets = false;
                let nextCanManageTickets = false;
                let nextUserId: string | null = null;

                if (accessRes.ok) {
                    const accessPayload = await accessRes.json();
                    const allowedModules = accessPayload.data?.allowed_modules || [];
                    nextCanAccessTickets = allowedModules.includes('tickets');
                    nextCanManageTickets = Boolean(accessPayload.data?.can_manage_access) && nextCanAccessTickets;
                    nextUserId = accessPayload.data?.user_id ?? null;
                    setCanAccessTickets(nextCanAccessTickets);
                    setCanManageTickets(nextCanManageTickets);
                    setCurrentUserId(nextUserId);
                }

                const [projectRes, notesRes] = await Promise.all([
                    fetch(`/api/projects?id=${projectId}`),
                    fetch(`/api/notes?project_id=${projectId}`),
                ]);

                if (!projectRes.ok) throw new Error('Failed to fetch project');
                const projectData = await projectRes.json();

                if (!projectData.data) {
                    throw new Error('Project not found');
                }

                setProject(projectData.data);

                if (notesRes.ok) {
                    const notesData = await notesRes.json();
                    setNotes(notesData.data || []);
                }

                if (nextCanAccessTickets) {
                    const scope = nextCanManageTickets ? 'manage' : 'mine';
                    const ticketsRes = await fetch(`/api/tickets?project_id=${projectId}&scope=${scope}`);
                    if (ticketsRes.ok) {
                        const ticketsData = await ticketsRes.json();
                        setTickets(ticketsData.data || []);
                    }
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
            router.push('/projects');
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    const handleCreateTicket = async (data: CreateTicketInput) => {
        setIsSavingTicket(true);
        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) throw new Error('Failed to create ticket');
            const payload = await res.json();
            setTickets((current) => [payload.data, ...current]);
            setShowTicketForm(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create ticket');
        } finally {
            setIsSavingTicket(false);
        }
    };

    const handleUpdateTicket = async (data: CreateTicketInput) => {
        if (!editingTicket) return;

        setIsSavingTicket(true);
        try {
            const res = await fetch(`/api/tickets/${editingTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) throw new Error('Failed to update ticket');
            const payload = await res.json();
            setTickets((current) => current.map((ticket) => (ticket.id === editingTicket.id ? payload.data : ticket)));
            setEditingTicket(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update ticket');
        } finally {
            setIsSavingTicket(false);
        }
    };

    const handleDeleteTicket = async (id: string) => {
        if (!confirm('Are you sure you want to delete this ticket?')) return;

        try {
            const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete ticket');
            setTickets((current) => current.filter((ticket) => ticket.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete ticket');
        }
    };

    if (isLoading) {
        return <PageLoader />;
    }

    if (error || !project) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <p className="text-red-400 mb-4">{error || 'Project not found'}</p>
                <Link href="/projects" className="btn-secondary">
                    Back to Projects
                </Link>
            </div>
        );
    }

    const status = inferStatus(project);

    return (
        <div className="min-h-screen p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <Link
                    href="/projects"
                    className="flex items-center gap-2 transition-colors text-text-secondary hover:text-text-primary"
                >
                    <ArrowLeft size={20} />
                    Back to Projects
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

            <div className="mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h1 className="text-text-primary text-3xl font-heading font-medium">{project.title}</h1>
                    <StatusBadge status={status} className="px-3 py-1 text-sm" />
                </div>

                {project.description && (
                    <p className="text-lg mb-6 text-text-secondary">{project.description}</p>
                )}

                <Card className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 !border-border-subtle bg-bg-elevated">
                    <div>
                        <PriorityBadge priority={project.priority} />
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">Created</p>
                        <p className="text-text-secondary">{formatDate(project.created_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">Updated</p>
                        <p className="text-text-secondary">{formatDate(project.updated_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">GitHub</p>
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
                    <div>
                        <p className="text-xs uppercase mb-1 text-text-muted">Deploy</p>
                        {project.deploy_url ? (
                            <a
                                href={project.deploy_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-accent-sage hover:underline"
                            >
                                <Rocket size={14} />
                                View App
                            </a>
                        ) : (
                            <p className="text-text-muted">Not deployed</p>
                        )}
                    </div>
                </Card>
            </div>

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

            <section>
                <Card className="p-6">
                    <NotesPanel notes={notes} onAddNote={handleAddNote} />
                </Card>
            </section>

            {canAccessTickets && (
                <section className="mt-6">
                    <Card className="p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-xl font-semibold font-body text-text-primary">
                                <TicketIcon size={20} className="text-accent-rose" />
                                Tickets
                                <span className="text-sm font-normal text-text-muted">({tickets.length})</span>
                            </h2>
                            <Button
                                variant="secondary"
                                icon={<Plus size={16} />}
                                onClick={() => {
                                    setEditingTicket(null);
                                    setShowTicketForm(true);
                                }}
                            >
                                Add Ticket
                            </Button>
                        </div>

                        {showTicketForm && (
                            <TicketForm
                                projects={[project]}
                                lockedProjectId={project.id}
                                onSave={handleCreateTicket}
                                onCancel={() => setShowTicketForm(false)}
                                isLoading={isSavingTicket}
                                title="New Ticket"
                            />
                        )}

                        {editingTicket && (
                            <TicketForm
                                projects={[project]}
                                initialData={editingTicket}
                                lockedProjectId={project.id}
                                onSave={handleUpdateTicket}
                                onCancel={() => setEditingTicket(null)}
                                isLoading={isSavingTicket}
                                title="Edit Ticket"
                            />
                        )}

                        {tickets.length === 0 ? (
                            <p className="py-6 text-center text-sm text-text-muted">No tickets yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {tickets.map((ticket) => (
                                    <TicketCard
                                        key={ticket.id}
                                        ticket={ticket}
                                        canManage={canManageTickets || ticket.user_id === currentUserId}
                                        onEdit={canManageTickets || ticket.user_id === currentUserId ? setEditingTicket : undefined}
                                        onDelete={canManageTickets || ticket.user_id === currentUserId ? handleDeleteTicket : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </Card>
                </section>
            )}
        </div>
    );
}
