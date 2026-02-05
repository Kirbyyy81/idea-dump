'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { DailyLogContent } from '@/lib/types';
import { Save } from 'lucide-react';

interface LogFormProps {
    initialContent?: DailyLogContent;
    onSave: (content: DailyLogContent) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
    title?: string;
}

/**
 * Default empty log content
 */
export function createDefaultLogContent(): DailyLogContent {
    return {
        date: new Date().toISOString().split('T')[0],
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        operation_task: '',
        tools_used: '',
        lesson_learned: '',
    };
}

/**
 * Reusable form for creating/editing daily log entries
 */
export function LogForm({
    initialContent,
    onSave,
    onCancel,
    isLoading = false,
    title = 'New Log Entry'
}: LogFormProps) {
    const [content, setContent] = useState<DailyLogContent>(
        initialContent || createDefaultLogContent()
    );

    const handleSubmit = async () => {
        if (!content.date) return;
        await onSave(content);
    };

    return (
        <Card className="p-6 mb-6">
            <h3 className="font-heading text-lg mb-4">{title}</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm text-text-secondary mb-1">Date</label>
                    <input
                        type="date"
                        value={content.date}
                        onChange={(e) => setContent({ ...content, date: e.target.value })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="block text-sm text-text-secondary mb-1">Day</label>
                    <input
                        type="text"
                        value={content.day || ''}
                        onChange={(e) => setContent({ ...content, day: e.target.value })}
                        className="input w-full"
                        placeholder="e.g., Monday"
                    />
                </div>
            </div>
            <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-1">Operation / Task</label>
                <textarea
                    value={content.operation_task || ''}
                    onChange={(e) => setContent({ ...content, operation_task: e.target.value })}
                    className="input w-full min-h-[80px] resize-y"
                    placeholder="What did you work on?"
                />
            </div>
            <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-1">Tools Used</label>
                <input
                    type="text"
                    value={content.tools_used || ''}
                    onChange={(e) => setContent({ ...content, tools_used: e.target.value })}
                    className="input w-full"
                    placeholder="e.g., VSCode, Supabase, Postman"
                />
            </div>
            <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-1">Lesson Learned</label>
                <textarea
                    value={content.lesson_learned || ''}
                    onChange={(e) => setContent({ ...content, lesson_learned: e.target.value })}
                    className="input w-full min-h-[60px] resize-y"
                    placeholder="What did you learn today?"
                />
            </div>
            <div className="flex gap-2">
                <Button variant="primary" onClick={handleSubmit} isLoading={isLoading} icon={<Save size={16} />}>
                    Save Entry
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </Card>
    );
}
