import {
    ChangeEventHandler,
    InputHTMLAttributes,
    ReactNode,
    forwardRef,
} from 'react';
import { Input } from '@/components/atoms/Input';
import { FieldShell } from '@/components/molecules/FieldShell';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    containerClassName?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    id: string;
    label: ReactNode;
    onValueChange?: (value: string) => void;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
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
        ...inputProps
    }, ref) => {
        const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
            onChange?.(event);
            onValueChange?.(event.currentTarget.value);
        };

        return (
            <FieldShell
                id={id}
                label={label}
                required={required}
                description={description}
                errorMessage={errorMessage}
                ariaDescribedBy={ariaDescribedBy}
                className={containerClassName}
            >
                {({ controlId, describedBy, hasError }) => (
                    <Input
                        {...inputProps}
                        ref={ref}
                        id={controlId}
                        required={required}
                        error={error || hasError}
                        aria-describedby={describedBy}
                        className={className}
                        onChange={handleChange}
                    />
                )}
            </FieldShell>
        );
    }
);

InputField.displayName = 'InputField';
