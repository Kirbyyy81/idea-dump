'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import {
    PriorityBadge,
} from '@/app/project/_components/PriorityBadge';
import {
    Ticket,
    ticketSourceConfig,
    TicketStatus,
    ticketStatusConfig,
} from '@/lib/types';
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

export function TicketCard({
    ticket,
    projectTitle,
    canManage = false,
    onEdit,
    onDelete,
}: TicketCardProps) {
    const showActions = canManage || Boolean(onEdit) || Boolean(onDelete);

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-3">
                        <h3 className="font-heading text-lg text-text-primary">{ticket.title}</h3>
                        <span className={cn('status-badge shrink-0', statusStyles[ticket.status])}>
                            {ticketStatusConfig[ticket.status].label}
                        </span>
                    </div>

                    {projectTitle && (
                        <p className="mb-2 text-sm text-text-muted">{projectTitle}</p>
                    )}

                    {ticket.description && (
                        <p className="mb-3 line-clamp-2 text-sm text-text-secondary">
                            {ticket.description}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                        {ticket.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {ticket.tags.map((tag) => (
                                    <span
                                        key={`${ticket.id}-${tag}`}
                                        className="rounded-full bg-bg-hover px-2 py-1 text-xs text-text-muted"
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <PriorityBadge priority={ticket.priority} showLabel={false} />
                        <span>{ticketSourceConfig[ticket.source].label}</span>
                        <span>{formatDate(ticket.created_at)}</span>
                    </div>
                </div>

                {showActions && (
                    <div className="flex shrink-0 gap-1">
                        {onEdit && (
                            <Button
                                variant="ghost"
                                onClick={() => onEdit(ticket)}
                                className="px-2 py-2 text-xs"
                                icon={<Pencil size={14} />}
                            >
                                Edit
                            </Button>
                        )}
                        {onDelete && (
                            <Button
                                variant="ghost"
                                onClick={() => onDelete(ticket.id)}
                                className="px-2 py-2 text-xs text-error hover:text-error"
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
