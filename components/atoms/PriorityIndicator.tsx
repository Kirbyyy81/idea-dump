import { HTMLAttributes } from 'react';
import { Priority, priorityConfig } from '@/lib/types';
import { Indicator } from '@/components/atoms/Indicator';
import { cn } from '@/lib/utils';

interface PriorityIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    priority: Priority;
    showCaption?: boolean;
    size?: 'sm' | 'md';
}

export function PriorityIndicator({
    priority,
    showCaption = false,
    size = 'md',
    className,
    ...props
}: PriorityIndicatorProps) {
    const config = priorityConfig[priority];

    return (
        <div className={cn('inline-flex flex-col gap-1', className)} {...props}>
            {showCaption && (
                <p className="text-xs uppercase text-text-muted">Priority</p>
            )}
            <Indicator
                size={size}
                dotClassName={config.indicatorClass}
                textClassName={config.textClass}
                aria-label={`${config.label} priority`}
            >
                {config.label}
            </Indicator>
        </div>
    );
}
