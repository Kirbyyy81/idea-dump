import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    action?: ReactNode;
    className?: string;
}

export function PageHeader({ action, className, title }: PageHeaderProps) {
    return (
        <header
            className={cn(
                'mb-6 flex flex-col gap-4 border-b border-border-default pb-5 sm:flex-row sm:items-center sm:justify-between',
                className
            )}
        >
            <h1 className="min-w-0 break-words font-heading text-2xl font-extrabold leading-tight text-text-primary">
                {title}
            </h1>
            {action && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {action}
                </div>
            )}
        </header>
    );
}
