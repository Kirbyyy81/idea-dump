import { redirect } from 'next/navigation';
import { FinanceTransactionsClient } from '@/app/finance/transactions/_components/FinanceTransactionsClient';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';
import { getFinanceTransactions } from '@/lib/finance/core/service';
import { parseFinanceTransactionListFilters } from '@/lib/finance/transactions/filters';

interface FinanceTransactionsPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';

function toUrlSearchParams(values: Record<string, string | string[] | undefined>) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value)) {
            value.forEach((item) => searchParams.append(key, item));
        } else if (value !== undefined) {
            searchParams.set(key, value);
        }
    }
    return searchParams;
}

export default async function FinanceTransactionsPage({
    searchParams,
}: FinanceTransactionsPageProps) {
    const session = await requireFinancePageAccess();
    const queryParams = toUrlSearchParams(await searchParams);
    const parsed = parseFinanceTransactionListFilters(queryParams);

    if ('error' in parsed) {
        redirect('/finance/transactions');
    }

    const transactions = await getFinanceTransactions(session.user.id, parsed.data);
    const filterQuery = queryParams.toString();

    return (
        <FinanceTransactionsClient
            key={filterQuery || 'default'}
            filterQuery={filterQuery}
            filters={parsed.data}
            initialQuery={parsed.data.query || ''}
            initialTransactions={transactions}
        />
    );
}
