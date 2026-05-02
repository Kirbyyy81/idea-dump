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
    const variantMap: Record<Status, 'idea' | 'dev' | 'deployed' | 'archived'> = {
        ideation: 'idea',
        development: 'dev',
        deployed: 'deployed',
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
