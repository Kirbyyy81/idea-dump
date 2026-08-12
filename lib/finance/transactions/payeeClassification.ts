export interface FinanceCounterpartyFields {
    merchant: string;
    has_payee: boolean;
    payee_name: string;
}

export function setFinancePayeeClassification(
    fields: FinanceCounterpartyFields,
    isPayee: boolean
): FinanceCounterpartyFields {
    if (isPayee) {
        const shouldMoveMerchant = !fields.payee_name.trim() && Boolean(fields.merchant.trim());
        return {
            merchant: shouldMoveMerchant ? '' : fields.merchant,
            has_payee: true,
            payee_name: shouldMoveMerchant ? fields.merchant : fields.payee_name,
        };
    }

    const shouldRestoreMerchant = !fields.merchant.trim() && Boolean(fields.payee_name.trim());
    return {
        merchant: shouldRestoreMerchant ? fields.payee_name : fields.merchant,
        has_payee: false,
        payee_name: '',
    };
}
