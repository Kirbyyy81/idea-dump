import { FinanceTransactionEntry } from './_components/FinanceTransactionEntry';

export default async function AddFinanceTransactionPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string | string[] }>;
}) {
    const { mode } = await searchParams;
    return <FinanceTransactionEntry initialMode={mode === 'manual' ? 'manual' : 'screenshot'} />;
}
