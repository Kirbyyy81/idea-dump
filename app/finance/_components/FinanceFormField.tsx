import { ReactNode } from 'react';
import type { FinanceFieldErrors, FinanceTransactionField } from '@/lib/finance/core/values';

interface FinanceFormFieldProps {
    children: ReactNode;
    error?: string;
    fieldId: string;
    label: string;
    required?: boolean;
    className?: string;
}

export function FinanceFormField({
    children,
    error,
    fieldId,
    label,
    required,
    className = '',
}: FinanceFormFieldProps) {
    return (
        <div className={className}>
            <label htmlFor={fieldId} className="block text-sm text-text-secondary">
                {label}
                {required && (
                    <>
                        <span aria-hidden="true" className="text-error"> *</span>
                            <span className="sr-only">, required</span>
                    </>
                )}
            </label>
            <div className="mt-2">{children}</div>
            {error && <p id={`${fieldId}-error`} className="mt-1 text-xs font-semibold text-error">{error}</p>}
        </div>
    );
}

export function FinanceFormErrorSummary({ errors }: { errors: FinanceFieldErrors }) {
    const messages = Array.from(new Set(
        Object.values(errors).filter((message): message is string => Boolean(message))
    ));
    if (messages.length === 0) return null;
    return (
        <div role="alert" className="mt-4 border border-error bg-error-bg px-4 py-3 text-sm text-error">
            <p className="font-semibold">Check the highlighted fields</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
                {messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
        </div>
    );
}

export function financeFieldErrorProps(
    errors: FinanceFieldErrors,
    field: FinanceTransactionField,
    fieldId: string,
) {
    const error = errors[field];
    return {
        error: Boolean(error),
        'aria-describedby': error ? `${fieldId}-error` : undefined,
    };
}

export function focusFirstFinanceError(errors: FinanceFieldErrors, order: FinanceTransactionField[]) {
    window.requestAnimationFrame(() => {
        const fields = Array.from(document.querySelectorAll<HTMLElement>('[data-finance-field]'));
        const element = fields.find((candidate) => {
            const field = candidate.dataset.financeField as FinanceTransactionField | undefined;
            return Boolean(field && errors[field]);
        });
        const fallbackField = order.find((candidate) => errors[candidate]);
        const target = element || (fallbackField
            ? document.querySelector<HTMLElement>(`[data-finance-field="${fallbackField}"]`)
            : null);
        if (!target) return;
        target.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'center',
        });
        target.focus({ preventScroll: true });
    });
}
