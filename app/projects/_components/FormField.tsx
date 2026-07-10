import { forwardRef, useId } from 'react';
import { Input, InputProps } from '@/components/atoms/Input';
import { Textarea, TextareaProps } from '@/components/atoms/Textarea';
import { cn } from '@/lib/utils';

interface FormFieldBaseProps {
    label: string;
    error?: string;
    required?: boolean;
    className?: string;
}

type InputFieldProps = FormFieldBaseProps & Omit<InputProps, 'error'> & { multiline?: false };
type TextareaFieldProps = FormFieldBaseProps & Omit<TextareaProps, 'error'> & { multiline: true };

type FormFieldProps = InputFieldProps | TextareaFieldProps;

export const FormField = forwardRef<HTMLInputElement | HTMLTextAreaElement, FormFieldProps>(
    ({ label, error, required, className, multiline, id: providedId, 'aria-describedby': describedBy, ...props }, ref) => {
        const generatedId = useId();
        const id = providedId ?? `form-field-${generatedId}`;
        const errorId = `${id}-error`;
        const ariaDescribedBy = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
        return (
            <div className={cn("space-y-2", className)}>
                <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
                    {label} {required && <span className="text-accent-rose">*</span>}
                </label>

                {multiline ? (
                    <Textarea
                        ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
                        error={!!error}
                        id={id}
                        required={required}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={ariaDescribedBy}
                        {...(props as TextareaProps)}
                    />
                ) : (
                    <Input
                        ref={ref as React.ForwardedRef<HTMLInputElement>}
                        error={!!error}
                        id={id}
                        required={required}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={ariaDescribedBy}
                        {...(props as InputProps)}
                    />
                )}

                {error && <p id={errorId} role="alert" className="text-sm text-error">{error}</p>}
            </div>
        );
    }
);

FormField.displayName = 'FormField';
