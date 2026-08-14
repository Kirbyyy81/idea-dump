import {
    ChangeEventHandler,
    ReactNode,
    forwardRef,
} from 'react';
import { Input, InputProps } from '@/components/atoms/Input';
import { cn } from '@/lib/utils';

export interface InputFieldProps extends InputProps {
    containerClassName?: string;
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
        const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
            onChange?.(event);
            onValueChange?.(event.currentTarget.value);
        };

        return (
            <div className={cn(containerClassName)}>
                <label htmlFor={id} className="block text-sm text-text-secondary">
                    {label}{required ? ' (required)' : ''}
                </label>
                <div className="mt-2">
                    <Input
                        {...inputProps}
                        ref={ref}
                        id={id}
                        required={required}
                        error={error || Boolean(errorMessage)}
                        aria-describedby={describedBy}
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
