import { AppShell } from '@/components/organisms/AppShell';
import { FinanceLoadingState } from '@/app/finance/_components/FinanceLoadingState';

interface FinanceRouteLoadingProps {
    label: string;
    pageTitle: string;
}

export function FinanceRouteLoading({ label, pageTitle }: FinanceRouteLoadingProps) {
    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle={pageTitle}>
            <div className="mx-auto max-w-7xl">
                <FinanceLoadingState label={label} />
            </div>
        </AppShell>
    );
}
