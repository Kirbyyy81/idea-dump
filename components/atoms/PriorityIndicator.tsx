import { HTMLAttributes } from 'react';
import { Priority, priorityConfig } from '@/lib/types';
import { Indicator } from '@/components/atoms/Indicator';
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

export function PriorityIndicator({
    priority,
    showCaption = false,
    size = 'md',
    className,
    ...props
}: PriorityIndicatorProps) {
    const config = priorityConfig[priority];
    const styles = priorityStyles[priority];

    return (
        <div className={cn('inline-flex flex-col gap-1', className)} {...props}>
            {showCaption && (
                <p className="text-xs uppercase text-text-muted">Priority</p>
            )}
            <Indicator
                size={size}
                dotClassName={styles.dot}
                textClassName={styles.text}
                aria-label={`${config.label} priority`}
            >
                {config.label}
            </Indicator>
        </div>
    );
}
