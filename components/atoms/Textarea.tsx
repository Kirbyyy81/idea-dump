import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                className={cn(
                    'input', // Reusing input base styles as they usually share border/bg properties
                    'min-h-[100px] resize-y',
                    error && 'border-error focus:border-error',
                    className
                )}
                {...props}
            />
        );
    }
);

Textarea.displayName = 'Textarea';
