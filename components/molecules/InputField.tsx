import {
    ChangeEventHandler,
    InputHTMLAttributes,
    ReactNode,
    forwardRef,
} from 'react';
import { cn } from '@/lib/utils';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    containerClassName?: string;
    error?: boolean;
    errorMessage?: string;
    id: string;
    label: ReactNode;
    onValueChange?: (value: string) => void;
}

function mergeDescribedBy(...values: Array<string | undefined>) {
    const ids = values
        .flatMap((value) => value?.split(/\s+/) ?? [])
        .filter(Boolean);
    return Array.from(new Set(ids)).join(' ') || undefined;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
    ({
        'aria-describedby': ariaDescribedBy,
        className,
        containerClassName,
        error,
        errorMessage,
        id,
        label,
        onChange,
        onValueChange,
        required,
        ...inputProps
    }, ref) => {
        const errorId = errorMessage ? `${id}-error` : undefined;
        const describedBy = mergeDescribedBy(ariaDescribedBy, errorId);
        const hasError = error || Boolean(errorMessage);
        const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
            onChange?.(event);
            onValueChange?.(event.currentTarget.value);
        };

        return (
            <div className={cn(containerClassName)}>
                <label htmlFor={id} className="block text-sm text-text-secondary">
                    {label}
                    {required && (
                        <>
                            <span aria-hidden="true" className="text-error"> *</span>
                            <span className="sr-only">, required</span>
                        </>
                    )}
                </label>
                <div className="mt-2">
                    <input
                        {...inputProps}
                        ref={ref}
                        id={id}
                        required={required}
                        aria-invalid={hasError || undefined}
                        aria-describedby={describedBy}
                        className={cn(
                            'input',
                            hasError && 'border-error focus:border-error',
                            className
                        )}
                        onChange={handleChange}
                    />
                </div>
                {errorMessage && (
                    <p id={errorId} className="mt-1 text-xs font-semibold text-error">
                        {errorMessage}
                    </p>
                )}
            </div>
        );
    }
);

InputField.displayName = 'InputField';
