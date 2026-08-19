'use client';

import { Button } from '@/components/atoms/Button';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';
import { FinanceReferenceDataStatus } from '@/app/finance/_components/FinanceReferenceDataProvider';

interface FinanceReferenceDataStateProps {
    status: Exclude<FinanceReferenceDataStatus, 'ready'>;
    error: string | null;
    retry: () => Promise<void>;
}

export function FinanceReferenceDataState({
    status,
    error,
    retry,
}: FinanceReferenceDataStateProps) {
    if (status === 'loading') {
        return <InlineLoadingState label="Loading Finance options..." />;
    }

    return (
        <div className="border border-error bg-error-bg p-5" role="alert">
            <p className="text-sm font-semibold text-error">
                {error || 'Could not load Finance options'}
            </p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => void retry()}>
                Retry
            </Button>
        </div>
    );
}
