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
import { PageLoader } from '@/components/atoms/Loader';
import { Project, Ticket, UpdateTicketInput, ticketSourceConfig, ticketStatusConfig } from '@/lib/types';

export default function TicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [filterProject, setFilterProject] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        async function fetchData() {
            try {
                const [ticketsRes, projectsRes] = await Promise.all([
                    fetch('/api/tickets?scope=mine'),
                    fetch('/api/projects'),
                ]);

                if (!ticketsRes.ok) throw new Error('Failed to fetch tickets');
                if (!projectsRes.ok) throw new Error('Failed to fetch projects');

                const ticketsPayload = await ticketsRes.json();
                const projectsPayload = await projectsRes.json();

                setTickets(ticketsPayload.data || []);
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
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this ticket?')) return;

        try {
            const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete ticket');
            setTickets((current) => current.filter((ticket) => ticket.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete ticket');
        }
    };

    const projectTitleById = useMemo(
        () => new Map(projects.map((project) => [project.id, project.title])),
        [projects]
    );

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <AppShell contentClassName="p-8">
            <div className="max-w-5xl space-y-6">
                <header className="flex items-center justify-between">
                    <h1 className="text-3xl font-heading font-medium">My Tickets</h1>
                    <Link href="/tickets/new">
                        <Button icon={<Plus size={18} />}>Raise Ticket</Button>
                    </Link>
                </header>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
                        <div className="min-w-[180px]">
                            <label className="mb-1 block text-xs text-text-muted">Project</label>
                            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input text-sm">
                                <option value="">All Projects</option>
                                {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-[160px]">
                            <label className="mb-1 block text-xs text-text-muted">Status</label>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input text-sm">
                                <option value="">All Statuses</option>
                                {Object.entries(ticketStatusConfig).map(([value, config]) => (
                                    <option key={value} value={value}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-[160px]">
                            <label className="mb-1 block text-xs text-text-muted">Priority</label>
                            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="input text-sm">
                                <option value="">All Priorities</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div className="min-w-[160px]">
                            <label className="mb-1 block text-xs text-text-muted">Source</label>
                            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="input text-sm">
                                <option value="">All Sources</option>
                                {Object.entries(ticketSourceConfig).map(([value, config]) => (
                                    <option key={value} value={value}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-[220px] flex-1">
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
                        <p className="text-text-muted mb-2">No tickets yet.</p>
                        <p className="text-text-muted">Raise a ticket to start tracking issues and follow-up work.</p>
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
