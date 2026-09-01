import { FinanceReviewClient } from '@/app/finance/review/_components/FinanceReviewClient';
import { requireFinancePageAccess } from '@/lib/finance/core/pageAccess';
import { getFinanceReviewQueueForUser } from '@/lib/finance/core/service';
import { FINANCE_TIME_ZONE, getFinanceDateInTimeZone } from '@/lib/finance/core/values';

interface FinanceReviewPageProps {
    searchParams: Promise<{
        candidate?: string | string[];
    }>;
}

export const dynamic = 'force-dynamic';

export default async function FinanceReviewPage({ searchParams }: FinanceReviewPageProps) {
    const session = await requireFinancePageAccess();
    const params = await searchParams;
    const queue = await getFinanceReviewQueueForUser(session.user.id);
    const today = getFinanceDateInTimeZone(FINANCE_TIME_ZONE);
    const requestedCandidateId = Array.isArray(params.candidate)
        ? params.candidate[0]
        : params.candidate;
    const initialSelectedId = requestedCandidateId
        && queue.data.some((candidate) => candidate.id === requestedCandidateId)
        ? requestedCandidateId
        : queue.data[0]?.id || '';

    return (
        <FinanceReviewClient
            initialCandidates={queue.data}
            initialFailedIntakes={queue.failed_intakes}
            initialSelectedId={initialSelectedId}
            today={today}
        />
    );
}
