import { redirect } from 'next/navigation';
import { isApplicationError } from '@/lib/api/applicationError';
import { FinanceTransactionEditor } from './_components/FinanceTransactionEditor';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import { getFinanceTransactionForUser } from '@/lib/finance/core/service';
import { getSessionUser } from '@/lib/rbac/access';

export const dynamic = 'force-dynamic';

interface FinanceTransactionEditRouteProps {
    searchParams: Promise<{ id?: string | string[] }>;
}

function parseTransactionId(value: string | string[] | undefined) {
    return typeof value === 'string' && isFinanceUuid(value) ? value : null;
}

export default async function FinanceTransactionEditRoute({
    searchParams,
}: FinanceTransactionEditRouteProps) {
    const { id } = await searchParams;
    const transactionId = parseTransactionId(id);

    if (!transactionId) {
        return (
            <FinanceTransactionEditor
                key="invalid-transaction"
                initialTransaction={null}
                loadError="Transaction not found."
                canRetry={false}
            />
        );
    }

    const user = await getSessionUser();
    if (!user) redirect('/login');

    try {
        const transaction = await getFinanceTransactionForUser(user.id, transactionId);
        return (
            <FinanceTransactionEditor
                key={`transaction:${transaction.id}`}
                initialTransaction={transaction}
                loadError={null}
                canRetry={false}
            />
        );
    } catch (error) {
        if (isApplicationError(error)) {
            return (
                <FinanceTransactionEditor
                    key={`error:${transactionId}`}
                    initialTransaction={null}
                    loadError={error.message}
                    canRetry={false}
                />
            );
        }

        console.error('Could not load the Finance transaction editor', {
            errorType: error instanceof Error ? error.name : 'UnknownError',
            transactionId,
        });

        return (
            <FinanceTransactionEditor
                key={`error:${transactionId}`}
                initialTransaction={null}
                loadError="Could not load transaction."
                canRetry
            />
        );
    }
}
