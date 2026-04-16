import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, hoverable, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'card',
                    hoverable && 'cursor-pointer hover:border-border-strong hover:-translate-y-0.5',
                    className
                )}
                {...props}
            />
        );
    }
);

Card.displayName = 'Card';
