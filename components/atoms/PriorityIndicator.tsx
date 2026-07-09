import { HTMLAttributes } from 'react';
import { Priority, priorityConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PriorityIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    priority: Priority;
    showCaption?: boolean;
    size?: 'sm' | 'md';
}

const priorityStyles: Record<Priority, { dot: string; text: string }> = {
    low: { dot: 'bg-border-strong', text: 'text-text-primary' },
    medium: { dot: 'bg-warning', text: 'text-warning' },
    high: { dot: 'bg-error', text: 'text-error' },
};

const sizeStyles = {
    sm: { dot: 'size-2.5', text: 'text-xs' },
    md: { dot: 'size-3', text: 'text-sm' },
};

export function PriorityIndicator({
    priority,
    showCaption = false,
    size = 'md',
    className,
    ...props
}: PriorityIndicatorProps) {
    const config = priorityConfig[priority];
    const styles = priorityStyles[priority];
    const sizes = sizeStyles[size];

    return (
        <div className={cn('inline-flex flex-col gap-1', className)} {...props}>
            {showCaption && (
                <p className="text-xs uppercase text-text-muted">Priority</p>
            )}
            <span
                className={cn('inline-flex items-center gap-2 font-medium', sizes.text, styles.text)}
                aria-label={`${config.label} priority`}
            >
                <span
                    className={cn('shrink-0 rounded-full', sizes.dot, styles.dot)}
                    aria-hidden="true"
                />
                {config.label}
            </span>
        </div>
    );
}
