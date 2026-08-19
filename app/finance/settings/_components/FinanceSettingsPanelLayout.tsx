import type { ReactNode } from 'react';
import { Card } from '@/components/atoms/Card';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';

interface FinanceSettingsPanelLayoutProps {
    children: ReactNode;
    description?: string;
}

export function FinanceSettingsPanelLayout({
    children,
    description,
}: FinanceSettingsPanelLayoutProps) {
    return (
        <div className="mx-auto max-w-7xl space-y-5">
            {description ? <p className="text-sm text-text-muted">{description}</p> : null}
            {children}
        </div>
    );
}

export function FinanceSettingsColumns({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] [&>*]:min-w-0">
            {children}
        </div>
    );
}

interface FinanceSettingsFormCardProps {
    action: ReactNode;
    children: ReactNode;
    title: string;
}

export function FinanceSettingsFormCard({
    action,
    children,
    title,
}: FinanceSettingsFormCardProps) {
    return (
        <Card className="p-5">
            <h2 className="text-base font-bold">{title}</h2>
            <div className="mt-5 space-y-4">{children}</div>
            <div className="mt-5">{action}</div>
        </Card>
    );
}

interface FinanceSettingsLibraryProps {
    children: ReactNode;
    emptyMessage: string;
    headingId: string;
    isEmpty: boolean;
    isLoading: boolean;
    loadingLabel: string;
    title: string;
}

export function FinanceSettingsLibrary({
    children,
    emptyMessage,
    headingId,
    isEmpty,
    isLoading,
    loadingLabel,
    title,
}: FinanceSettingsLibraryProps) {
    return (
        <section
            aria-busy={isLoading}
            aria-labelledby={headingId}
            className="border border-border-default bg-bg-surface"
        >
            <div className="border-b border-border-default px-5 py-4">
                <h2 id={headingId} className="text-base font-bold">{title}</h2>
            </div>
            <div className="divide-y divide-border-default">
                {isLoading ? (
                    <InlineLoadingState label={loadingLabel} />
                ) : (
                    <>
                        {children}
                        {isEmpty
                            ? <p className="px-5 py-12 text-center text-sm text-text-muted">{emptyMessage}</p>
                            : null}
                    </>
                )}
            </div>
        </section>
    );
}
