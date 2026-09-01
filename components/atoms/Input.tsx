import {
    ChangeEventHandler,
    InputHTMLAttributes,
    ReactNode,
    forwardRef,
    useId,
} from 'react';
import { FieldShell } from '@/components/atoms/FieldShell';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    containerClassName?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    label?: ReactNode;
    onValueChange?: (value: string) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({
        'aria-describedby': ariaDescribedBy,
        className,
        containerClassName,
        description,
        error,
        errorMessage,
        id,
        label,
        onChange,
        onValueChange,
        required,
        ...props
    }, ref) => {
        const generatedId = useId();
        const controlId = id || `input-${generatedId}`;
        const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
            onChange?.(event);
            onValueChange?.(event.currentTarget.value);
        };
        const renderInput = (
            describedBy = ariaDescribedBy,
            hasFieldError = false
        ) => (
            <input
                {...props}
                ref={ref}
                id={controlId}
                required={required}
                aria-invalid={error || hasFieldError || undefined}
                aria-describedby={describedBy}
                className={cn(
                    'input',
                    (error || hasFieldError) && 'border-error focus:border-error',
                    className
                )}
                onChange={handleChange}
            />
        );

        if (!label && !description && !errorMessage && !containerClassName) {
            return renderInput();
        }

        return (
            <FieldShell
                id={controlId}
                label={label}
                required={required}
                description={description}
                errorMessage={errorMessage}
                ariaDescribedBy={ariaDescribedBy}
                className={containerClassName}
            >
                {({ describedBy, hasError }) => renderInput(describedBy, hasError)}
            </FieldShell>
        );
    }
);

Input.displayName = 'Input';
