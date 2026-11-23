import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/rbac/access';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { isFinanceServiceError } from '@/lib/finance/core/errors';
import { getFinanceTransactionSplit } from '@/lib/finance/transactions/splits';
import { FinanceSplitEditor } from './_components/FinanceSplitEditor';

export const dynamic = 'force-dynamic';

export default async function FinanceSplitPage({ searchParams }: {
    searchParams: Promise<{ id?: string | string[] }>;
}) {
    const { id } = await searchParams;
    const user = await getSessionUser();
    if (!user) redirect('/login');
    if (!isFinanceUuid(id)) return <FinanceSplitEditor loadError="Original payment not found." />;
    try {
        const split = await getFinanceTransactionSplit(user.id, id);
        return <FinanceSplitEditor key={id} initialSplit={split} />;
    } catch (error) {
        const message = isFinanceServiceError(error) ? error.message : 'Could not load the original payment.';
        return <FinanceSplitEditor loadError={message} />;
    }
}
