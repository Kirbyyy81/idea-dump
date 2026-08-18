'use client';

import { AppShell } from '@/components/organisms/AppShell';

interface FinanceRouteErrorProps {
    message: string;
    pageTitle: string;
    reset: () => void;
}

export function FinanceRouteError({ message, pageTitle, reset }: FinanceRouteErrorProps) {
    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle={pageTitle}>
            <div className="mx-auto max-w-7xl">
                <div role="alert" className="rounded-md border border-error bg-error-bg px-4 py-4 text-sm text-error">
                    <p>{message}</p>
                    <button type="button" className="btn-primary mt-4" onClick={reset}>Retry</button>
                </div>
            </div>
        </AppShell>
    );
}
