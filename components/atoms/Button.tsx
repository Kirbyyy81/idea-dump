import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { LoaderOne } from '@/components/atoms/Loader';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', isLoading, icon, children, disabled, ...props }, ref) => {
        const variantClass = {
            primary: 'btn-primary',
            secondary: 'btn-secondary',
            ghost: 'btn-ghost',
        }[variant];

        return (
            <button
                ref={ref}
                className={cn(variantClass, className)}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? (
                    <LoaderOne size="sm" className="mr-2" />
                ) : icon ? (
                    <span className="mr-2">{icon}</span>
                ) : null}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
