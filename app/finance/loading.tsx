import { AppShell } from '@/components/organisms/AppShell';
import { FinanceLoadingState } from '@/app/finance/_components/FinanceLoadingState';

export default function FinanceLoading() {
    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle="Finance">
            <div className="mx-auto max-w-7xl">
                <FinanceLoadingState label="Loading Finance..." />
            </div>
        </AppShell>
    );
}
