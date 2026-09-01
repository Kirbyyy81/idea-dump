import { AppShell } from '@/components/organisms/AppShell';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';

interface FinanceRouteLoadingProps {
    label: string;
    pageTitle: string;
}

export function FinanceRouteLoading({ label, pageTitle }: FinanceRouteLoadingProps) {
    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle={pageTitle}>
            <div className="mx-auto max-w-7xl">
                <InlineLoadingState label={label} />
            </div>
        </AppShell>
    );
}
