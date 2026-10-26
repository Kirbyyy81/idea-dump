'use client';

import { CheckDoodleIcon } from '@/components/atoms/DoodleIcons';
import { cn } from '@/lib/utils';

export function Checkbox({ checked, onChange, ariaLabel, disabled = false, className }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel: string;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn('grid size-11 place-items-center rounded-md hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark disabled:cursor-not-allowed disabled:opacity-60', className)}
        >
            <span aria-hidden="true" className={cn('grid size-5 place-items-center rounded-xs border border-border-strong bg-bg-surface', checked && 'border-action-primary bg-action-primary text-text-on-dark')}>
                {checked && <CheckDoodleIcon size={16} />}
            </span>
        </button>
    );
}
