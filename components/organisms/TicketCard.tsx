'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { priorityConfig, Ticket, TicketStatus, ticketSourceConfig, ticketStatusConfig } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

interface TicketCardProps {
    ticket: Ticket;
    projectTitle?: string;
    canManage?: boolean;
    onEdit?: (ticket: Ticket) => void;
    onDelete?: (id: string) => void;
}

const statusStyles: Record<TicketStatus, string> = {
    todo: 'bg-bg-hover text-text-muted',
    in_progress: 'bg-accent-blue/20 text-accent-blue',
    to_review: 'bg-accent-apricot/20 text-text-primary',
    done: 'bg-accent-sage/20 text-accent-sage',
    closed: 'bg-bg-hover text-text-muted line-through',
};

export function TicketCard({ ticket, projectTitle, canManage = false, onEdit, onDelete }: TicketCardProps) {
    const showActions = canManage || Boolean(onEdit) || Boolean(onDelete);

    return (
        <Card className="p-4">
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-text-primary font-semibold">{ticket.title}</h3>
                        {projectTitle && <p className="text-sm text-text-muted">{projectTitle}</p>}
                    </div>
                    <span className={cn('status-badge', statusStyles[ticket.status])}>
                        {ticketStatusConfig[ticket.status].label}
                    </span>
                </div>

                {ticket.description && (
                    <p className="line-clamp-2 text-sm text-text-secondary">{ticket.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {ticket.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-bg-hover px-2 py-0.5">
                            #{tag}
                        </span>
                    ))}
                    <span className={cn('rounded-full bg-bg-hover px-2 py-0.5', priorityConfig[ticket.priority].textClass)}>
                        {priorityConfig[ticket.priority].label}
                    </span>
                    <span className="rounded-full bg-bg-hover px-2 py-0.5">
                        {ticketSourceConfig[ticket.source].label}
                    </span>
                    <span>{formatDate(ticket.created_at)}</span>
                </div>

                {ticket.notes && (
                    <p className="text-sm italic text-text-secondary">{ticket.notes}</p>
                )}

                {showActions && (
                    <div className="flex gap-2">
                        {onEdit && (
                            <Button variant="ghost" onClick={() => onEdit(ticket)} className="text-sm">
                                Edit
                            </Button>
                        )}
                        {onDelete && (
                            <Button
                                variant="ghost"
                                onClick={() => onDelete(ticket.id)}
                                className="text-sm text-error hover:text-error"
                                icon={<Trash2 size={14} />}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
