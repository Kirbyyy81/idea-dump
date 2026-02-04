import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { iconMap } from '@/lib/icons';

interface StatusBadgeProps {
    status: Status;
    size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
    const config = statusConfig[status];
    const IconComponent = iconMap[config.icon];

    // Get background color class based on status
    const getBgClass = (status: Status) => {
        switch (status) {
            case 'idea': return 'bg-info-bg border-status-idea text-status-idea';
            case 'prd': return 'bg-[#FEF2F4] border-status-prd text-status-prd'; // Keeping custom hex for now if not in vars, or map to error-bg? check globals.
            case 'in_development': return 'bg-warning-bg border-status-dev text-status-dev';
            case 'completed': return 'bg-success-bg border-status-complete text-status-complete';
            case 'archived': return 'bg-bg-subtle border-status-archived text-status-archived';
            default: return 'bg-bg-subtle border-status-archived text-status-archived';
        }
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-medium border',
                size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
                getBgClass(status)
            )}
        >
            {IconComponent && <IconComponent size={size === 'sm' ? 12 : 14} />}
            <span>{config.label}</span>
        </span>
    );
}
