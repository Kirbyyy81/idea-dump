'use client';

import { DailyLogEntry, DailyLogContent } from '@/lib/types';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
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
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Date</label>
                            <input
                                type="date"
                                value={editContent.date}
                                onChange={(e) => onEditContentChange({ ...editContent, date: e.target.value })}
                                className="input w-full text-sm py-1"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Day</label>
                            <input
                                type="text"
                                value={editContent.day || ''}
                                onChange={(e) => onEditContentChange({ ...editContent, day: e.target.value })}
                                className="input w-full text-sm py-1"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-text-muted mb-1">Task</label>
                        <textarea
                            value={editContent.operation_task || ''}
                            onChange={(e) => onEditContentChange({ ...editContent, operation_task: e.target.value })}
                            className="input w-full text-sm py-1 min-h-[60px]"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-text-muted mb-1">Tools</label>
                        <input
                            type="text"
                            value={editContent.tools_used || ''}
                            onChange={(e) => onEditContentChange({ ...editContent, tools_used: e.target.value })}
                            className="input w-full text-sm py-1"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-text-muted mb-1">Lesson</label>
                        <textarea
                            value={editContent.lesson_learned || ''}
                            onChange={(e) => onEditContentChange({ ...editContent, lesson_learned: e.target.value })}
                            className="input w-full text-sm py-1 min-h-[40px]"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="primary" onClick={onSaveEdit} isLoading={isSaving} className="text-sm py-1">
                            Save
                        </Button>
                        <Button variant="ghost" onClick={onCancelEdit} className="text-sm py-1">
                            Cancel
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
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
                <div className="flex gap-1">
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
