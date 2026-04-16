import { Priority, priorityConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PriorityBadgeProps {
    priority: Priority;
    className?: string;
    showLabel?: boolean;
}

export function PriorityBadge({ priority, className, showLabel = true }: PriorityBadgeProps) {
    const config = priorityConfig[priority];

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {!showLabel && (
                <div
                    className={cn("w-2 h-2 rounded-full", config.indicatorClass)}
                    title={`${config.label} priority`}
                />
            )}

            {showLabel && (
                <>
                    <p className="text-xs uppercase text-text-muted">Priority</p>
                    <p className={cn("font-medium", config.textClass)}>
                        {config.label}
                    </p>
                </>
            )}
        </div>
    );
}
