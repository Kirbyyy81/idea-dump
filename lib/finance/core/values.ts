import {
    getDateInTimeZone as getFinanceDateInTimeZone,
    getLocalDate as getLocalFinanceDate,
    getLocalMonth as getLocalFinanceMonth,
    getLocalTimeZone as getFinanceTimeZone,
    getMonthRange as getFinanceMonthRange,
    isFutureDate as isFutureFinanceDate,
    normalizeDate as normalizeFinanceDate,
    shiftMonth as shiftFinanceMonth,
} from '@/shared/date';

export {
    getFinanceDateInTimeZone,
    getFinanceMonthRange,
    getFinanceTimeZone,
    getLocalFinanceDate,
    getLocalFinanceMonth,
    isFutureFinanceDate,
    normalizeFinanceDate,
    shiftFinanceMonth,
};

const FINANCE_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export const MAX_FINANCE_AMOUNT = 999_999_999_999.99;
export const MAX_FINANCE_NAME_LENGTH = 120;
export const MAX_FINANCE_MERCHANT_LENGTH = 500;
export const MAX_FINANCE_PAYEE_LENGTH = 500;
export const MAX_FINANCE_REFERENCE_LENGTH = 200;
export const MAX_FINANCE_NOTES_LENGTH = 2500;
export const FINANCE_TIME_ZONE_HEADER = 'X-Finance-Time-Zone';
export const FINANCE_TIME_ZONE = 'Asia/Kuala_Lumpur';

const MAX_FINANCE_AMOUNT_MINOR_UNITS = BigInt('99999999999999');
const ONE_HUNDRED = BigInt(100);
const ZERO = BigInt(0);

export function toFinanceAmountMinorUnits(value: unknown) {
    const text = typeof value === 'number'
        ? Number.isFinite(value) ? String(value) : ''
        : typeof value === 'string' ? value.trim() : '';
    if (!FINANCE_AMOUNT_PATTERN.test(text)) return null;

    const [whole, fraction = ''] = text.split('.');
    const minorUnits = BigInt(whole) * ONE_HUNDRED + BigInt(fraction.padEnd(2, '0'));
    return minorUnits > ZERO && minorUnits <= MAX_FINANCE_AMOUNT_MINOR_UNITS
        ? minorUnits
        : null;
}

export function financeMinorUnitsToNumber(value: bigint) {
    return Number(value) / 100;
}

export function toPositiveFinanceAmount(value: unknown) {
    const minorUnits = toFinanceAmountMinorUnits(value);
    return minorUnits === null ? null : financeMinorUnitsToNumber(minorUnits);
}

export type FinanceTransactionField =
    | 'source_id'
    | 'category_id'
    | 'direction'
    | 'amount'
    | 'merchant'
    | 'has_payee'
    | 'payee_name'
    | 'reference_number'
    | 'transaction_date'
    | 'notes'
    | 'new_source_name'
    | 'new_category_name'
    | 'allow_duplicate'
    | 'duplicate_override_reason';

export type FinanceFieldErrors = Partial<Record<FinanceTransactionField, string>>;

export interface FinanceTransactionFields {
    source_id?: unknown;
    category_id?: unknown;
    direction?: unknown;
    amount?: unknown;
    merchant?: unknown;
    has_payee?: unknown;
    payee_name?: unknown;
    reference_number?: unknown;
    transaction_date?: unknown;
    notes?: unknown;
}

const FINANCE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimmedFinanceText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function hasFinanceLetterOrNumber(value: string) {
    return Array.from(value.normalize('NFKC')).some((character) => (
        character >= '0' && character <= '9'
    ) || character.toLocaleLowerCase('en') !== character.toLocaleUpperCase('en'));
}

export function getFinanceTransactionFieldErrors(
    fields: FinanceTransactionFields,
    today = getLocalFinanceDate(),
    options: { validateIds?: boolean } = {}
): FinanceFieldErrors {
    const errors: FinanceFieldErrors = {};
    const sourceId = trimmedFinanceText(fields.source_id);
    const categoryId = trimmedFinanceText(fields.category_id);
    const merchant = trimmedFinanceText(fields.merchant);
    const payeeName = trimmedFinanceText(fields.payee_name);
    const referenceNumber = trimmedFinanceText(fields.reference_number);
    const notes = trimmedFinanceText(fields.notes);
    const transactionDate = normalizeFinanceDate(fields.transaction_date);

    if (!sourceId) errors.source_id = 'Choose a source';
    else if (options.validateIds && !FINANCE_UUID_PATTERN.test(sourceId)) {
        errors.source_id = 'Choose a valid source';
    }
    if (categoryId && options.validateIds && !FINANCE_UUID_PATTERN.test(categoryId)) {
        errors.category_id = 'Choose a valid category';
    }
    if (fields.direction !== 'expense' && fields.direction !== 'income') {
        errors.direction = 'Choose expense or income';
    }
    if (toPositiveFinanceAmount(fields.amount) === null) {
        errors.amount = 'Enter a positive amount with at most two decimals';
    }
    if (!transactionDate) errors.transaction_date = 'Enter a valid transaction date';
    else if (isFutureFinanceDate(transactionDate, today)) {
        errors.transaction_date = 'Transaction date cannot be in the future';
    }
    if (merchant.length > MAX_FINANCE_MERCHANT_LENGTH) {
        errors.merchant = `Merchant must be ${MAX_FINANCE_MERCHANT_LENGTH} characters or fewer`;
    }
    if (fields.has_payee !== undefined && typeof fields.has_payee !== 'boolean') {
        errors.has_payee = 'Choose whether this transaction has a payee';
    }
    if (fields.has_payee === true && !payeeName) {
        errors.payee_name = 'Enter the payee name';
    }
    if (fields.has_payee !== true && payeeName) {
        errors.has_payee = 'Select "Is a payee" to save a payee name';
    }
    if (payeeName.length > MAX_FINANCE_PAYEE_LENGTH) {
        errors.payee_name = `Payee must be ${MAX_FINANCE_PAYEE_LENGTH} characters or fewer`;
    } else if (payeeName && !hasFinanceLetterOrNumber(payeeName)) {
        errors.payee_name = 'Payee must contain a letter or number';
    }
    if (referenceNumber.length > MAX_FINANCE_REFERENCE_LENGTH) {
        errors.reference_number = `Reference number must be ${MAX_FINANCE_REFERENCE_LENGTH} characters or fewer`;
    }
    if (notes.length > MAX_FINANCE_NOTES_LENGTH) {
        errors.notes = `Notes must be ${MAX_FINANCE_NOTES_LENGTH.toLocaleString('en-US')} characters or fewer`;
    }

    return errors;
}

export function getFinanceTransactionTextError(fields: {
    merchant?: unknown;
    payee_name?: unknown;
    reference_number?: unknown;
    notes?: unknown;
}) {
    const errors = getFinanceTransactionFieldErrors({
        source_id: '00000000-0000-0000-0000-000000000000',
        direction: 'expense',
        amount: '1',
        transaction_date: getLocalFinanceDate(),
        has_payee: Boolean(trimmedFinanceText(fields.payee_name)),
        ...fields,
    });
    return errors.merchant
        || errors.payee_name
        || errors.reference_number
        || errors.notes
        || null;
}
