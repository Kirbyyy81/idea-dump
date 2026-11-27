'use client';

import { useId } from 'react';
import { DailyLogContent } from '@/lib/types';
import { Input } from '@/components/atoms/Input';
import { DatePicker } from '@/components/atoms/DatePicker';
import { Textarea } from '@/components/atoms/Textarea';

interface LogContentFieldsProps {
    content: DailyLogContent;
    onChange: (content: DailyLogContent) => void;
    /** Use compact styling for inline editing (smaller text, abbreviated labels, no bottom margins) */
    compact?: boolean;
}

/**
 * Shared form fields for daily log content (date, day, task, tools, lesson).
 * Used by both LogForm (create) and LogEntryCard (edit) to avoid duplication.
 *
 * In default mode: full labels, standard sizing, mb-4 spacing between fields.
 * In compact mode: abbreviated labels, smaller inputs, no bottom margins (parent uses space-y).
 */
export function LogContentFields({ content, onChange, compact = false }: LogContentFieldsProps) {
    const fieldId = useId();
    const labelClass = compact
        ? 'block text-xs text-text-muted mb-1'
        : 'block text-sm text-text-secondary mb-1';
    const inputClass = compact
        ? 'input w-full text-sm py-1'
        : 'input w-full';
    const fieldGap = compact ? '' : 'mb-4';

    return (
        <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${compact ? 'gap-3' : 'gap-4'} ${fieldGap}`}>
                <div>
                    <DatePicker
                        label="Date"
                        value={content.date}
                        onChange={(date) => onChange({ ...content, date })}
                        buttonClassName={inputClass}
                    />
                </div>
                <div>
                    <label htmlFor={`${fieldId}-day`} className={labelClass}>Day</label>
                    <Input
                        id={`${fieldId}-day`}
                        type="text"
                        value={content.day || ''}
                        onChange={(e) => onChange({ ...content, day: e.target.value })}
                        className={inputClass}
                        placeholder="e.g., Monday"
                    />
                </div>
            </div>
            <div className={fieldGap}>
                <label htmlFor={`${fieldId}-task`} className={labelClass}>
                    {compact ? 'Task' : 'Operation / Task'}
                </label>
                <Textarea
                    id={`${fieldId}-task`}
                    value={content.operation_task || ''}
                    onChange={(e) => onChange({ ...content, operation_task: e.target.value })}
                    className={`${inputClass} ${compact ? 'min-h-[60px]' : 'min-h-[80px] resize-y'}`}
                    placeholder="What did you work on?"
                />
            </div>
            <div className={fieldGap}>
                <label htmlFor={`${fieldId}-tools`} className={labelClass}>
                    {compact ? 'Tools' : 'Tools Used'}
                </label>
                <Input
                    id={`${fieldId}-tools`}
                    type="text"
                    value={content.tools_used || ''}
                    onChange={(e) => onChange({ ...content, tools_used: e.target.value })}
                    className={inputClass}
                    placeholder="e.g., VSCode, Supabase, Postman"
                />
            </div>
            <div className={fieldGap}>
                <label htmlFor={`${fieldId}-lesson`} className={labelClass}>
                    {compact ? 'Lesson' : 'Lesson Learned'}
                </label>
                <Textarea
                    id={`${fieldId}-lesson`}
                    value={content.lesson_learned || ''}
                    onChange={(e) => onChange({ ...content, lesson_learned: e.target.value })}
                    className={`${inputClass} ${compact ? 'min-h-[40px]' : 'min-h-[60px] resize-y'}`}
                    placeholder="What did you learn today?"
                />
            </div>
        </>
    );
}
