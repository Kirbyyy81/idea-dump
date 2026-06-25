'use client';

import { DailyLogContent } from '@/lib/types';

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
    const labelClass = compact
        ? 'block text-xs text-text-muted mb-1'
        : 'block text-sm text-text-secondary mb-1';
    const inputClass = compact
        ? 'input w-full text-sm py-1'
        : 'input w-full';
    const fieldGap = compact ? '' : 'mb-4';

    return (
        <>
            <div className={`grid grid-cols-2 ${compact ? 'gap-3' : 'gap-4'} ${fieldGap}`}>
                <div>
                    <label className={labelClass}>Date</label>
                    <input
                        type="date"
                        value={content.date}
                        onChange={(e) => onChange({ ...content, date: e.target.value })}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Day</label>
                    <input
                        type="text"
                        value={content.day || ''}
                        onChange={(e) => onChange({ ...content, day: e.target.value })}
                        className={inputClass}
                        placeholder="e.g., Monday"
                    />
                </div>
            </div>
            <div className={fieldGap}>
                <label className={labelClass}>
                    {compact ? 'Task' : 'Operation / Task'}
                </label>
                <textarea
                    value={content.operation_task || ''}
                    onChange={(e) => onChange({ ...content, operation_task: e.target.value })}
                    className={`${inputClass} ${compact ? 'min-h-[60px]' : 'min-h-[80px] resize-y'}`}
                    placeholder="What did you work on?"
                />
            </div>
            <div className={fieldGap}>
                <label className={labelClass}>
                    {compact ? 'Tools' : 'Tools Used'}
                </label>
                <input
                    type="text"
                    value={content.tools_used || ''}
                    onChange={(e) => onChange({ ...content, tools_used: e.target.value })}
                    className={inputClass}
                    placeholder="e.g., VSCode, Supabase, Postman"
                />
            </div>
            <div className={fieldGap}>
                <label className={labelClass}>
                    {compact ? 'Lesson' : 'Lesson Learned'}
                </label>
                <textarea
                    value={content.lesson_learned || ''}
                    onChange={(e) => onChange({ ...content, lesson_learned: e.target.value })}
                    className={`${inputClass} ${compact ? 'min-h-[40px]' : 'min-h-[60px] resize-y'}`}
                    placeholder="What did you learn today?"
                />
            </div>
        </>
    );
}