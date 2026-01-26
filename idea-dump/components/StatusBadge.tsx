import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
    status: Status;
    size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
    const config = statusConfig[status];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-medium',
                size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
            )}
            style={{
                backgroundColor: `${config.color}20`,
                color: config.color,
                boxShadow: `0 0 8px ${config.color}40`
            }}
        >
            <span>{config.icon}</span>
            <span>{config.label}</span>
        </span>
    );
}
