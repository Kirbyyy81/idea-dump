import { FinanceTransactionEntry } from './_components/FinanceTransactionEntry';
import { getFinanceEntryMode } from './entryMode';

export default async function AddFinanceTransactionPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string | string[] }>;
}) {
    const { mode } = await searchParams;
    return <FinanceTransactionEntry initialMode={getFinanceEntryMode(mode)} />;
}
