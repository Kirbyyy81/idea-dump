import { forwardRef } from 'react';
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
    ({ label, error, required, className, multiline, ...props }, ref) => {
        return (
            <div className={cn("space-y-2", className)}>
                <label className="block text-sm font-medium text-text-secondary">
                    {label} {required && <span className="text-accent-rose">*</span>}
                </label>

                {multiline ? (
                    <Textarea
                        ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
                        error={!!error}
                        {...(props as TextareaProps)}
                    />
                ) : (
                    <Input
                        ref={ref as React.ForwardedRef<HTMLInputElement>}
                        error={!!error}
                        {...(props as InputProps)}
                    />
                )}

                {error && <p className="text-sm text-error">{error}</p>}
            </div>
        );
    }
);

FormField.displayName = 'FormField';
