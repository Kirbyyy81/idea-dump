import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'idea' | 'prd' | 'dev' | 'complete' | 'archived';
    icon?: LucideIcon;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', icon: Icon, children, ...props }, ref) => {
        const variantClasses = {
            default: 'bg-bg-subtle text-text-primary border-border-default',
            idea: 'badge-idea',
            prd: 'badge-prd',
            dev: 'badge-dev',
            complete: 'badge-complete',
            archived: 'bg-bg-subtle text-text-muted border-text-muted',
        };

        return (
            <span
                ref={ref}
                className={cn('status-badge', variantClasses[variant], className)}
                {...props}
            >
                {Icon && <Icon size={12} className="mr-1" />}
                {children}
            </span>
        );
    }
);

Badge.displayName = 'Badge';
