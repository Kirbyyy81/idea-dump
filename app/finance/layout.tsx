import { FinanceShareTargetProvider } from '@/app/finance/_components/FinanceShareTargetProvider';
import { FinanceReferenceDataProvider } from '@/app/finance/_components/FinanceReferenceData';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';

export default async function FinanceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireFinancePageAccess();

    return (
        <FinanceShareTargetProvider>
            <FinanceReferenceDataProvider>{children}</FinanceReferenceDataProvider>
        </FinanceShareTargetProvider>
    );
}
