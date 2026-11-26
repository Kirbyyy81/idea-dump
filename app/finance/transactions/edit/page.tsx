import { redirect } from 'next/navigation';
import { FinanceTransactionEditor } from './_components/FinanceTransactionEditor';
import { isFinanceUuid } from '@/lib/finance/core/schemas';
import {
    getFinanceTransactionForUser,
    isFinanceServiceError,
} from '@/lib/finance/core/service';
import { getSessionUser } from '@/lib/rbac/access';
import { getFinanceSplitTransactionEdit } from '@/lib/finance/transactions/splits';
import type { FinanceTransaction, FinanceTransactionSplit } from '@/lib/types';

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

    let split: FinanceTransactionSplit | undefined;
    let transaction: FinanceTransaction;
    try {
        transaction = await getFinanceTransactionForUser(user.id, transactionId);
        if (transaction.is_split) {
            const edit = await getFinanceSplitTransactionEdit(user.id, transaction.id);
            transaction = edit.transaction;
            split = edit.split;
        }
    } catch (error) {
        if (isFinanceServiceError(error)) {
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
    return (
        <FinanceTransactionEditor
            key={`transaction:${transaction.id}:${split?.version ?? transaction.updated_at}`}
            initialTransaction={transaction}
            initialSplit={split}
            loadError={null}
            canRetry={false}
        />
    );
}
