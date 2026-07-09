import { HTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface IndicatorProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    children: ReactNode;
    dotClassName?: string;
    size?: 'sm' | 'md';
    textClassName?: string;
}

const sizeStyles = {
    sm: {
        dot: 'size-2.5',
        text: 'text-xs',
    },
    md: {
        dot: 'size-3',
        text: 'text-sm',
    },
};

export const Indicator = forwardRef<HTMLSpanElement, IndicatorProps>(
    ({ children, className, dotClassName, size = 'md', textClassName, ...props }, ref) => {
        const styles = sizeStyles[size];

        return (
            <span
                ref={ref}
                className={cn('inline-flex w-fit items-center gap-2 font-medium', styles.text, textClassName, className)}
                {...props}
            >
                <span className={cn('shrink-0 rounded-full', styles.dot, dotClassName)} aria-hidden="true" />
                {children}
            </span>
        );
    }
);

Indicator.displayName = 'Indicator';
