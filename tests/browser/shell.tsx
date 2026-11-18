import type { ReactNode } from 'react';
import { PageHeader } from '@/components/molecules/PageHeader';

interface AppShellProps {
    children: ReactNode;
    pageTitle?: string;
    headerAction?: ReactNode;
    headerClassName?: string;
    headerLeading?: ReactNode;
    contentClassName?: string;
}

export function AppShell({ children, pageTitle, headerAction, headerClassName, headerLeading, contentClassName }: AppShellProps) {
    return <main className={contentClassName}>
        {pageTitle && headerLeading ? (
            <PageHeader title={pageTitle} action={headerAction} className={headerClassName} leading={headerLeading} />
        ) : (
            <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{pageTitle}</h1>{headerAction}</header>
        )}
        {children}
    </main>;
}
