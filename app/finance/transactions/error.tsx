'use client';

import { FinanceRouteError } from '@/app/finance/_components/FinanceRouteError';

interface FinanceTransactionsErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function FinanceTransactionsError({ reset }: FinanceTransactionsErrorProps) {
    return <FinanceRouteError pageTitle="Transactions" message="Could not load the transaction ledger." reset={reset} />;
}
