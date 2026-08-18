'use client';

import { FinanceRouteError } from '@/app/finance/_components/FinanceRouteError';

interface FinanceReviewErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function FinanceReviewError({ reset }: FinanceReviewErrorProps) {
    return <FinanceRouteError pageTitle="Review queue" message="Could not load the review queue." reset={reset} />;
}
