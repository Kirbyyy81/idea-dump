'use client';

import { LoaderOne } from '@/components/atoms/Loader';
import { cn } from '@/lib/utils';

interface InlineLoadingStateProps {
    label: string;
    className?: string;
}

export function InlineLoadingState({ label, className }: InlineLoadingStateProps) {
    return (
        <div
            className={cn('flex items-center justify-center gap-3 px-5 py-12 text-sm text-text-muted', className)}
            role="status"
            aria-live="polite"
        >
            <LoaderOne size="sm" />
            <span>{label}</span>
        </div>
    );
}
