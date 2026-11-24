'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { CheckDoodleIcon } from '@/components/atoms/DoodleIcons';

interface SelectOptionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    selected: boolean;
}

export const SelectOptionButton = forwardRef<HTMLButtonElement, SelectOptionButtonProps>(
    ({ selected, disabled, className, children, ...props }, ref) => (
        <button {...props} ref={ref} type="button" disabled={disabled} className={cn(
            'flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
            'focus-visible:bg-bg-hover focus-visible:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-border-dark',
            selected ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary',
            disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-text-secondary',
            className
        )}>
            {children}
            {selected && <CheckDoodleIcon size={14} className="shrink-0 text-accent-rose" />}
        </button>
    )
);

SelectOptionButton.displayName = 'SelectOptionButton';
