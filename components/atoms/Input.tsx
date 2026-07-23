import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <input
                ref={ref}
                aria-invalid={error || undefined}
                className={cn(
                    'input',
                    error && 'border-error focus:border-error',
                    className
                )}
                {...props}
            />
        );
    }
);

Input.displayName = 'Input';
