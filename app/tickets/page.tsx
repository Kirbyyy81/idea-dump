'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { PageLoader } from '@/components/atoms/Loader';
import { TicketCard } from './_components/TicketCard';
import { Project, Ticket, ticketSourceConfig, ticketStatusConfig } from '@/lib/types';

export default function TicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
                    fetch('/api/tickets?scope=mine'),
                    fetch('/api/projects'),
                ]);

                if (!ticketsRes.ok) throw new Error('Failed to fetch tickets');

                const ticketsData = await ticketsRes.json();
                const projectsData = projectsRes.ok
                    ? await projectsRes.json()
                    : { data: [] };

                setTickets(ticketsData.data || []);
                setProjects(projectsData.data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, []);

    const projectTitleMap = useMemo(
        () => new Map(projects.map((project) => [project.id, project.title])),
        [projects]
    );

    const filteredTickets = useMemo(() => {
        return tickets.filter((ticket) => {
            if (filterProject && ticket.project_id !== filterProject) return false;
            if (filterStatus && ticket.status !== filterStatus) return false;
            if (filterPriority && ticket.priority !== filterPriority) return false;
            if (filterSource && ticket.source !== filterSource) return false;
            if (!query.trim()) return true;

            const haystack = [
                ticket.title,
                ticket.description,
                ticket.notes,
                ticket.tags.join(' '),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(query.trim().toLowerCase());
        });
    }, [filterPriority, filterProject, filterSource, filterStatus, query, tickets]);

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <AppShell contentClassName="p-8">
            <div className="space-y-6">
                <header className="flex items-center justify-between">
                    <h1 className="text-3xl font-heading font-medium">My Tickets</h1>
                    <Link href="/tickets/new" className="btn-primary inline-flex items-center justify-center">
                        <span className="mr-2">
                            <Plus size={18} />
                        </span>
                        <span>Raise Ticket</span>
                    </Link>
                </header>

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg p-3">
                        <p className="text-sm text-error">{error}</p>
                    </div>
                )}

                <Card className="p-4">
                    <div className="flex flex-col gap-3">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input">
                                <option value="">All projects</option>
                                {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.title}
                                    </option>
                                ))}
                            </select>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
                                <option value="">All statuses</option>
                                {Object.entries(ticketStatusConfig).map(([value, config]) => (
                                    <option key={value} value={value}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="input">
                                <option value="">All priorities</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="input">
                                <option value="">All sources</option>
                                {Object.entries(ticketSourceConfig).map(([value, config]) => (
                                    <option key={value} value={value}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search tickets..."
                                    className="pl-9 pr-9"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end">
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
                    </div>
                </Card>

                {filteredTickets.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-text-muted mb-2">No tickets yet.</p>
                        <p className="text-text-muted">Raise a ticket to start tracking work.</p>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {filteredTickets.map((ticket) => (
                            <TicketCard
                                key={ticket.id}
                                ticket={ticket}
                                projectTitle={projectTitleMap.get(ticket.project_id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
