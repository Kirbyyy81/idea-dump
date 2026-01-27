import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Lightbulb, FileText, Code, CheckCircle, Archive } from 'lucide-react';

const iconMap = {
    Lightbulb,
    FileText,
    Code,
    CheckCircle,
    Archive,
};

interface StatusBadgeProps {
    status: Status;
    size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
    const config = statusConfig[status];
    const IconComponent = iconMap[config.icon as keyof typeof iconMap];

    // Get background color based on status
    const getBgColor = (status: Status) => {
        switch (status) {
            case 'idea': return 'var(--info-bg)';
            case 'prd': return '#FEF2F4';
            case 'in_development': return 'var(--warning-bg)';
            case 'completed': return 'var(--success-bg)';
            case 'archived': return 'var(--bg-subtle)';
            default: return 'var(--bg-subtle)';
        }
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-medium',
                size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
            )}
            style={{
                backgroundColor: getBgColor(status),
                color: config.color,
                border: `1px solid ${config.color}`,
            }}
        >
            {IconComponent && <IconComponent size={size === 'sm' ? 12 : 14} />}
            <span>{config.label}</span>
        </span>
    );
}
