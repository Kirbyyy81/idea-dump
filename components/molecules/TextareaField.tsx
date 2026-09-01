import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { Textarea } from '@/components/atoms/Textarea';
import { FieldShell } from '@/components/molecules/FieldShell';

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    containerClassName?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    id: string;
    label: ReactNode;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
    ({
        'aria-describedby': ariaDescribedBy,
        className,
        containerClassName,
        description,
        error,
        errorMessage,
        id,
        label,
        required,
        ...textareaProps
    }, ref) => (
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
                <Textarea
                    {...textareaProps}
                    ref={ref}
                    id={controlId}
                    required={required}
                    error={error || hasError}
                    aria-describedby={describedBy}
                    className={className}
                />
            )}
        </FieldShell>
    )
);

TextareaField.displayName = 'TextareaField';
