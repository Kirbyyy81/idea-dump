import { FinanceTransactionEditPage } from './_components/FinanceTransactionEditPage';
import { getFinanceTransactionEditId } from './transactionEditRoute';

interface FinanceTransactionEditRouteProps {
    searchParams: Promise<{ id?: string | string[] }>;
}

export default async function FinanceTransactionEditRoute({
    searchParams,
}: FinanceTransactionEditRouteProps) {
    const { id } = await searchParams;
    return (
        <FinanceTransactionEditPage
            transactionId={getFinanceTransactionEditId(id)}
        />
    );
}
