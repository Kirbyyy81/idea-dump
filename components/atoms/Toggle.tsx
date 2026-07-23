'use client';

import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, ariaLabel, className, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border border-border-default bg-bg-elevated px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60',
        checked && 'border-accent-rose bg-accent-rose/10 text-text-primary',
        className,
      )}
    >
      <span
        className={cn(
          'relative h-5 w-9 rounded-full bg-bg-hover transition-colors',
          checked && 'bg-accent-rose',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-text-muted transition-transform',
            checked && 'translate-x-4 bg-action-primary-text',
          )}
        />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
