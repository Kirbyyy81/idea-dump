'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { ChevronDownDoodleIcon } from '@/components/atoms/DoodleIcons';
import { cn } from '@/lib/utils';

interface SelectTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    open: boolean;
    error?: boolean;
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
    ({ children, className, disabled, error, open, ...props }, ref) => (
        <button
            {...props}
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
                'input flex h-10 items-center justify-between gap-2 pr-10 text-left',
                disabled && 'cursor-not-allowed opacity-60',
                error && 'border-error focus:border-error',
                className
            )}
        >
            {children}
            <ChevronDownDoodleIcon
                size={16}
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-transform',
                    open && 'rotate-180'
                )}
            />
        </button>
    )
);

SelectTrigger.displayName = 'SelectTrigger';
