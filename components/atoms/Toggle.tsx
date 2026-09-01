'use client';

import { ReactNode, useId } from 'react';
import { FieldShell } from '@/components/atoms/FieldShell';
import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  toggleLabel: string;
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: string;
  containerClassName?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
  error?: boolean;
  id?: string;
  dataFinanceField?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'data-finance-field'?: string;
}

export function Toggle({
  checked,
  onChange,
  toggleLabel,
  label,
  description,
  errorMessage,
  containerClassName,
  ariaLabel,
  ariaDescribedBy,
  'aria-describedby': standardAriaDescribedBy,
  'aria-label': standardAriaLabel,
  error,
  id,
  dataFinanceField,
  'data-finance-field': standardDataFinanceField,
  className,
  disabled,
  required,
}: ToggleProps) {
  const generatedId = useId();
  const controlId = id || `toggle-${generatedId}`;
  const resolvedAriaDescribedBy = standardAriaDescribedBy || ariaDescribedBy;
  const resolvedAriaLabel = standardAriaLabel || ariaLabel;
  const resolvedDataFinanceField = standardDataFinanceField || dataFinanceField;
  const renderToggle = (
    describedBy = resolvedAriaDescribedBy,
    hasFieldError = false
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={resolvedAriaLabel}
      aria-describedby={describedBy}
      aria-invalid={error || hasFieldError || undefined}
      aria-required={required || undefined}
      data-finance-field={resolvedDataFinanceField}
      id={controlId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border border-border-default bg-bg-elevated px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60',
        checked && 'border-accent-rose bg-accent-rose/10 text-text-primary',
        (error || hasFieldError) && 'border-error text-error',
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
      <span className="whitespace-nowrap">{toggleLabel}</span>
    </button>
  );

  if (!label && !description && !errorMessage && !containerClassName) {
    return renderToggle();
  }

  return (
    <FieldShell
      id={controlId}
      label={label}
      required={required}
      description={description}
      errorMessage={errorMessage}
      ariaDescribedBy={resolvedAriaDescribedBy}
      className={containerClassName}
    >
      {({ describedBy, hasError }) => renderToggle(describedBy, hasError)}
    </FieldShell>
  );
}
