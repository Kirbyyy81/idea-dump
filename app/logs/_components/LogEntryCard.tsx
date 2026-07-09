'use client';

import { DailyLogEntry, DailyLogContent } from '@/lib/types';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { LogContentFields } from './LogContentFields';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntryCardProps {
    log: DailyLogEntry;
    isEditing: boolean;
    editContent: DailyLogContent | null;
    isSaving: boolean;
    onStartEdit: (log: DailyLogEntry) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onDelete: (id: string) => void;
    onEditContentChange: (content: DailyLogContent) => void;
}

/**
 * Card component for displaying and editing a single log entry
 */
export function LogEntryCard({
    log,
    isEditing,
    editContent,
    isSaving,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    onEditContentChange,
}: LogEntryCardProps) {
    if (isEditing && editContent) {
        return (
            <Card className="p-4">
                <div className="space-y-3">
                    <LogContentFields content={editContent} onChange={onEditContentChange} compact />
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button variant="primary" onClick={onSaveEdit} isLoading={isSaving} className="w-full text-sm py-1 sm:w-auto">
                            Save
                        </Button>
                        <Button variant="ghost" onClick={onCancelEdit} className="w-full text-sm py-1 sm:w-auto">
                            Cancel
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            log.source === 'agent'
                                ? "bg-accent-blue/20 text-accent-blue"
                                : "bg-accent-sage/20 text-text-secondary"
                        )}>
                            {log.source}
                        </span>
                        {log.content.day && (
                            <span className="text-sm text-text-muted">{log.content.day}</span>
                        )}
                    </div>
                    {log.content.operation_task && (
                        <p className="text-text-primary mb-2">{log.content.operation_task}</p>
                    )}
                    {log.content.tools_used && (
                        <p className="text-sm text-text-secondary mb-1">
                            <span className="text-text-muted">Tools:</span> {log.content.tools_used}
                        </p>
                    )}
                    {log.content.lesson_learned && (
                        <p className="text-sm text-text-secondary italic">
                            <span className="text-text-muted">Learned:</span> {log.content.lesson_learned}
                        </p>
                    )}
                </div>
                <div className="flex gap-1 sm:justify-end">
                    <Button variant="ghost" onClick={() => onStartEdit(log)} className="text-xs p-2">
                        Edit
                    </Button>
                    <Button variant="ghost" onClick={() => onDelete(log.id)} className="text-xs p-2 text-error hover:text-error">
                        <Trash2 size={14} />
                    </Button>
                </div>
            </div>
        </Card>
    );
}
