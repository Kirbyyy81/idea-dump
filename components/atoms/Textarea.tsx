import { ReactNode, TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { FieldShell } from '@/components/atoms/FieldShell';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    containerClassName?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    label?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
        ...props
    }, ref) => {
        const generatedId = useId();
        const controlId = id || `textarea-${generatedId}`;
        const renderTextarea = (
            describedBy = ariaDescribedBy,
            hasFieldError = false
        ) => (
            <textarea
                {...props}
                ref={ref}
                id={controlId}
                required={required}
                aria-invalid={error || hasFieldError || undefined}
                aria-describedby={describedBy}
                className={cn(
                    'input',
                    'min-h-[100px] resize-y',
                    (error || hasFieldError) && 'border-error focus:border-error',
                    className
                )}
            />
        );

        if (!label && !description && !errorMessage && !containerClassName) {
            return renderTextarea();
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
                {({ describedBy, hasError }) => renderTextarea(describedBy, hasError)}
            </FieldShell>
        );
    }
);

Textarea.displayName = 'Textarea';
