import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldControlState {
    controlId: string;
    describedBy?: string;
    hasError: boolean;
}

interface FieldShellProps {
    ariaDescribedBy?: string;
    children: (state: FieldControlState) => ReactNode;
    className?: string;
    description?: ReactNode;
    errorMessage?: string;
    id: string;
    label?: ReactNode;
    required?: boolean;
}

function mergeDescribedBy(...values: Array<string | undefined>) {
    const ids = values
        .flatMap((value) => value?.split(/\s+/) ?? [])
        .filter(Boolean);
    return Array.from(new Set(ids)).join(' ') || undefined;
}

export function FieldShell({
    ariaDescribedBy,
    children,
    className,
    description,
    errorMessage,
    id,
    label,
    required,
}: FieldShellProps) {
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = errorMessage ? `${id}-error` : undefined;
    const describedBy = mergeDescribedBy(ariaDescribedBy, descriptionId, errorId);

    return (
        <div className={cn(className)}>
            {label && (
                <label htmlFor={id} className="block text-sm text-text-secondary">
                    {label}
                    {required && (
                        <>
                            <span aria-hidden="true" className="text-error"> *</span>
                            <span className="sr-only">, required</span>
                        </>
                    )}
                </label>
            )}
            <div className={cn(label && 'mt-2')}>
                {children({
                    controlId: id,
                    describedBy,
                    hasError: Boolean(errorMessage),
                })}
            </div>
            {description && (
                <div id={descriptionId} className="mt-1 text-xs text-text-muted">
                    {description}
                </div>
            )}
            {errorMessage && (
                <p id={errorId} className="mt-1 text-xs font-semibold text-error">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}
