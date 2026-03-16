'use client';

import { cn } from '@/lib/utils';

interface LoaderProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

/**
 * LoaderOne - A simple, elegant loader inspired by Aceternity UI
 * Three bouncing dots with staggered animation
 */
export function LoaderOne({ className, size = 'md' }: LoaderProps) {
    const sizeClasses = {
        sm: 'h-1.5 w-1.5',
        md: 'h-2.5 w-2.5',
        lg: 'h-4 w-4',
    };

    const gapClasses = {
        sm: 'gap-1',
        md: 'gap-2',
        lg: 'gap-3',
    };

    return (
        <div className={cn('flex items-center justify-center', gapClasses[size], className)}>
            <div
                className={cn(
                    'rounded-full bg-accent-rose animate-bounce',
                    sizeClasses[size]
                )}
                style={{ animationDelay: '0ms', animationDuration: '600ms' }}
            />
            <div
                className={cn(
                    'rounded-full bg-accent-rose animate-bounce',
                    sizeClasses[size]
                )}
                style={{ animationDelay: '150ms', animationDuration: '600ms' }}
            />
            <div
                className={cn(
                    'rounded-full bg-accent-rose animate-bounce',
                    sizeClasses[size]
                )}
                style={{ animationDelay: '300ms', animationDuration: '600ms' }}
            />
        </div>
    );
}

/**
 * LoaderTwo - A spinning ring loader
 */
export function LoaderTwo({ className, size = 'md' }: LoaderProps) {
    const sizeClasses = {
        sm: 'h-5 w-5',
        md: 'h-8 w-8',
        lg: 'h-12 w-12',
    };

    return (
        <div className={cn('relative', sizeClasses[size], className)}>
            <div className="absolute inset-0 rounded-full border-2 border-accent-rose/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-rose animate-spin" />
        </div>
    );
}

/**
 * LoaderThree - A pulsing dot loader
 */
export function LoaderThree({ className, size = 'md' }: LoaderProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-10 w-10',
    };

    return (
        <div className={cn('relative', sizeClasses[size], className)}>
            <div className="absolute inset-0 rounded-full bg-accent-rose/30 animate-ping" />
            <div className="absolute inset-1 rounded-full bg-accent-rose" />
        </div>
    );
}

/**
 * PageLoader - Full page loading state with LoaderOne
 */
export function PageLoader({ message }: { message?: string }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base gap-4">
            <LoaderOne size="lg" />
            {message && (
                <p className="text-text-muted text-sm animate-pulse">{message}</p>
            )}
        </div>
    );
}
