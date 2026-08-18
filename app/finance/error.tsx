'use client';

import { AppShell } from '@/components/organisms/AppShell';

interface FinanceErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function FinanceError({ reset }: FinanceErrorProps) {
    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle="Finance">
            <div className="mx-auto max-w-7xl">
                <div role="alert" className="rounded-md border border-error bg-error-bg px-4 py-4 text-sm text-error">
                    <p>Could not load the Finance page.</p>
                    <button type="button" className="btn-primary mt-4" onClick={reset}>Retry</button>
                </div>
            </div>
        </AppShell>
    );
}
