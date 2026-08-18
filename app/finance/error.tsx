'use client';

import { FinanceRouteError } from '@/app/finance/_components/FinanceRouteError';

interface FinanceErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function FinanceError({ reset }: FinanceErrorProps) {
    return <FinanceRouteError pageTitle="Finance" message="Could not load the Finance page." reset={reset} />;
}
