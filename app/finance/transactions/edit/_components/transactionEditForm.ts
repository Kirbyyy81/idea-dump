import type {
    FinanceTransaction,
    FinanceTransactionDirection,
} from '@/lib/types';

export interface FinanceTransactionEditFormState {
    amount: string;
    category_id: string;
    direction: FinanceTransactionDirection;
    has_payee: boolean;
    merchant: string;
    notes: string;
    payee_name: string;
    reference_number: string;
    source_id: string;
    transaction_date: string;
}

export function createFinanceTransactionEditForm(
    transaction: FinanceTransaction
): FinanceTransactionEditFormState {
    return {
        source_id: transaction.source_id,
        category_id: transaction.category_id || '',
        direction: transaction.direction,
        amount: transaction.amount.toString(),
        merchant: transaction.merchant || '',
        has_payee: Boolean(transaction.payee_id),
        payee_name: transaction.finance_payee?.name || '',
        reference_number: transaction.reference_number || '',
        transaction_date: transaction.transaction_date,
        notes: transaction.notes || '',
    };
}
