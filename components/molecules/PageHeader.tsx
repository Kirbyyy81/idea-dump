import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    action?: ReactNode;
    className?: string;
    leading?: ReactNode;
}

export function PageHeader({ action, className, leading, title }: PageHeaderProps) {
    const heading = (
        <h1 className="min-w-0 break-words font-heading text-2xl font-extrabold leading-tight text-text-primary">
            {title}
        </h1>
    );

    return (
        <header
            className={cn(
                'mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
                className
            )}
        >
            {leading ? <div className="flex min-w-0 items-center gap-2">{leading}{heading}</div> : heading}
            {action && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {action}
                </div>
            )}
        </header>
    );
}
