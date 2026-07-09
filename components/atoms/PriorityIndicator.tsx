import { HTMLAttributes } from 'react';
import { Priority, priorityConfig } from '@/lib/types';
import { Badge, BadgeProps } from '@/components/atoms/Badge';
import { cn } from '@/lib/utils';

interface PriorityIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    priority: Priority;
    showCaption?: boolean;
    size?: 'sm' | 'md';
}

const priorityStyles: Record<Priority, { dot: string; variant: BadgeProps['variant'] }> = {
    low: { dot: 'bg-border-strong', variant: 'priorityLow' },
    medium: { dot: 'bg-warning', variant: 'priorityMedium' },
    high: { dot: 'bg-error', variant: 'priorityHigh' },
};

const sizeStyles = {
    sm: 'px-2.5 py-0.5 text-xs',
    md: 'px-3 py-1 text-xs',
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
            <Badge
                variant={styles.variant}
                dotClassName={styles.dot}
                className={cn('w-fit', sizeStyles[size])}
                aria-label={`${config.label} priority`}
            >
                {config.label}
            </Badge>
        </div>
    );
}
