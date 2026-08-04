'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { TicketCard } from '@/components/organisms/TicketCard';
import { TicketForm } from '@/components/organisms/TicketForm';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { deleteTicket, listTickets, TicketClientError, updateTicket } from '@/lib/tickets/client';
import { Project, Ticket, UpdateTicketInput, ticketSourceConfig, ticketStatusConfig } from '@/lib/types';

export default function ManageTicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterProject, setFilterProject] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        async function fetchData() {
            try {
                const [ticketsRes, projectsRes] = await Promise.all([
                    listTickets({ scope: 'manage' })
                        .then((data) => ({ data }))
                        .catch((error: unknown) => ({ error })),
                    fetch('/api/projects'),
                ]);

                if ('error' in ticketsRes && ticketsRes.error instanceof TicketClientError && ticketsRes.error.status === 403) {
                    setError('You do not have access to manage tickets.');
                    setTickets([]);
                } else if ('error' in ticketsRes) {
                    throw ticketsRes.error;
                } else {
                    setTickets(ticketsRes.data);
                }

                if (!projectsRes.ok) throw new Error('Failed to fetch projects');
                const projectsPayload = await projectsRes.json();
                setProjects(projectsPayload.data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load tickets');
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, []);

    const filteredTickets = useMemo(
        () =>
            tickets.filter((ticket) => {
                if (filterProject && ticket.project_id !== filterProject) return false;
                if (filterStatus && ticket.status !== filterStatus) return false;
                if (filterPriority && ticket.priority !== filterPriority) return false;
                if (filterSource && ticket.source !== filterSource) return false;

                if (query.trim()) {
                    const q = query.trim().toLowerCase();
                    const haystack = [ticket.title, ticket.description, ticket.notes]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                    if (!haystack.includes(q)) return false;
                }

                return true;
            }),
        [tickets, filterProject, filterStatus, filterPriority, filterSource, query]
    );

    const handleUpdate = async (data: UpdateTicketInput & { project_id?: string }) => {
        if (!editingTicket) return;

        setIsSaving(true);
        try {
            const updatedTicket = await updateTicket(editingTicket.id, data);
            setTickets((current) => current.map((ticket) => (
                ticket.id === editingTicket.id ? updatedTicket : ticket
            )));
            setEditingTicket(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update ticket');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this ticket?')) return;

        try {
            await deleteTicket(id);
            setTickets((current) => current.filter((ticket) => ticket.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete ticket');
        }
    };

    const projectTitleById = useMemo(
        () => new Map(projects.map((project) => [project.id, project.title])),
        [projects]
    );

    return (
        <AppShell
            projects={projects}
            isLoading={isLoading}
            loadingMessage="Loading tickets..."
            contentClassName="p-5 md:p-8"
            pageTitle="Manage Tickets"
            headerAction={
                <Link href="/tickets/new" className="shrink-0">
                    <Button icon={<Plus size={18} />} className="h-10 px-4">Raise Ticket</Button>
                </Link>
            }
        >
            <div className="max-w-5xl space-y-6">
                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                {editingTicket && (
                    <TicketForm
                        projects={projects}
                        initialData={editingTicket}
                        lockedProjectId={editingTicket.project_id}
                        onSave={handleUpdate}
                        onCancel={() => setEditingTicket(null)}
                        isLoading={isSaving}
                        title="Edit Ticket"
                    />
                )}

                <Card className="p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-full sm:min-w-[180px] sm:flex-1 lg:flex-none">
                            <label className="mb-1 block text-xs text-text-muted">Project</label>
                            <Select
                                value={filterProject}
                                onChange={setFilterProject}
                                buttonClassName="text-sm"
                                options={[
                                    { value: '', label: 'All Projects' },
                                    ...projects.map((project) => ({ value: project.id, label: project.title })),
                                ]}
                            />
                        </div>
                        <div className="w-full sm:min-w-[160px] sm:flex-1 lg:flex-none">
                            <label className="mb-1 block text-xs text-text-muted">Status</label>
                            <Select
                                value={filterStatus}
                                onChange={setFilterStatus}
                                buttonClassName="text-sm"
                                options={[
                                    { value: '', label: 'All Statuses' },
                                    ...Object.entries(ticketStatusConfig).map(([value, config]) => ({
                                        value,
                                        label: config.label,
                                    })),
                                ]}
                            />
                        </div>
                        <div className="w-full sm:min-w-[160px] sm:flex-1 lg:flex-none">
                            <label className="mb-1 block text-xs text-text-muted">Priority</label>
                            <Select
                                value={filterPriority}
                                onChange={setFilterPriority}
                                buttonClassName="text-sm"
                                options={[
                                    { value: '', label: 'All Priorities' },
                                    { value: 'low', label: 'Low' },
                                    { value: 'medium', label: 'Medium' },
                                    { value: 'high', label: 'High' },
                                ]}
                            />
                        </div>
                        <div className="w-full sm:min-w-[160px] sm:flex-1 lg:flex-none">
                            <label className="mb-1 block text-xs text-text-muted">Source</label>
                            <Select
                                value={filterSource}
                                onChange={setFilterSource}
                                buttonClassName="text-sm"
                                options={[
                                    { value: '', label: 'All Sources' },
                                    ...Object.entries(ticketSourceConfig).map(([value, config]) => ({
                                        value,
                                        label: config.label,
                                    })),
                                ]}
                            />
                        </div>
                        <div className="w-full min-w-0 flex-1 sm:min-w-[220px]">
                            <label className="mb-1 block text-xs text-text-muted">Search</label>
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search title, description, or notes"
                                className="text-sm"
                            />
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full sm:w-auto"
                            onClick={() => {
                                setFilterProject('');
                                setFilterStatus('');
                                setFilterPriority('');
                                setFilterSource('');
                                setQuery('');
                            }}
                        >
                            Clear
                        </Button>
                    </div>
                </Card>

                {filteredTickets.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-text-muted mb-2">No tickets found.</p>
                        <p className="text-text-muted">Adjust your filters or raise a new ticket.</p>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {filteredTickets.map((ticket) => (
                            <TicketCard
                                key={ticket.id}
                                ticket={ticket}
                                projectTitle={projectTitleById.get(ticket.project_id)}
                                canManage
                                onEdit={setEditingTicket}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
