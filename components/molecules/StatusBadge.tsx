import { Status, statusConfig } from '@/lib/types';
import { Badge } from '@/components/atoms/Badge';
import { iconMap } from '@/lib/icons';

interface StatusBadgeProps {
    status: Status;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = statusConfig[status];
    const IconComponent = iconMap[config.icon];

    // Map status to badge variant
    const variantMap: Record<Status, 'idea' | 'prd' | 'dev' | 'complete' | 'archived'> = {
        idea: 'idea',
        prd: 'prd',
        in_development: 'dev',
        completed: 'complete',
        archived: 'archived',
    };

    return (
        <Badge
            variant={variantMap[status]}
            icon={IconComponent}
            className={className}
        >
            {config.label}
        </Badge>
    );
}
