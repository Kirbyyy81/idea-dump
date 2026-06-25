'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { DailyLogContent } from '@/lib/types';
import { LogContentFields } from './LogContentFields';
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
            <LogContentFields content={content} onChange={setContent} />
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
