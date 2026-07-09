import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?:
        | 'default'
        | 'idea'
        | 'prd'
        | 'dev'
        | 'complete'
        | 'deployed'
        | 'archived'
        | 'priorityLow'
        | 'priorityMedium'
        | 'priorityHigh';
    icon?: LucideIcon;
    dotClassName?: string;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', icon: Icon, dotClassName, children, ...props }, ref) => {
        const variantClasses = {
            default: 'bg-bg-subtle text-text-primary border-border-default',
            idea: 'badge-idea',
            prd: 'badge-prd',
            dev: 'badge-dev',
            complete: 'badge-complete',
            deployed: 'badge-deployed',
            archived: 'bg-bg-subtle text-text-muted border-text-muted',
            priorityLow: 'bg-bg-hover text-text-primary border-border-strong',
            priorityMedium: 'bg-warning-bg text-warning border-warning',
            priorityHigh: 'bg-error-bg text-error border-error',
        };

        return (
            <span
                ref={ref}
                className={cn('status-badge', variantClasses[variant], className)}
                {...props}
            >
                {Icon && <Icon size={12} className="mr-1" />}
                {dotClassName && <span className={cn('size-2 rounded-full', dotClassName)} aria-hidden="true" />}
                {children}
            </span>
        );
    }
);

Badge.displayName = 'Badge';
