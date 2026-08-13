const FINANCE_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const FINANCE_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FINANCE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_FINANCE_AMOUNT = 999_999_999_999.99;
export const MAX_FINANCE_NAME_LENGTH = 120;
export const MAX_FINANCE_MERCHANT_LENGTH = 500;
export const MAX_FINANCE_PAYEE_LENGTH = 500;
export const MAX_FINANCE_REFERENCE_LENGTH = 200;
export const MAX_FINANCE_NOTES_LENGTH = 2500;
export const FINANCE_TIME_ZONE_HEADER = 'X-Finance-Time-Zone';

const MAX_FINANCE_AMOUNT_MINOR_UNITS = BigInt('99999999999999');
const ONE_HUNDRED = BigInt(100);
const ZERO = BigInt(0);

function pad(value: number, length = 2) {
    return String(value).padStart(length, '0');
}

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

function isLeapYear(year: number) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function normalizeFinanceDate(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = FINANCE_DATE_PATTERN.exec(text);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
        return null;
    }
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function getFinanceMonthRange(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = FINANCE_MONTH_PATTERN.exec(text);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1) return null;

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
        month: text,
        monthStart: `${pad(year, 4)}-${pad(month)}-01`,
        nextMonthStart: `${pad(nextYear, Math.max(4, String(nextYear).length))}-${pad(nextMonth)}-01`,
    };
}

export function shiftFinanceMonth(value: unknown, offset: number) {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = FINANCE_MONTH_PATTERN.exec(text);
    if (!match || !Number.isInteger(offset)) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const shiftedIndex = year * 12 + month - 1 + offset;
    const shiftedYear = Math.floor(shiftedIndex / 12);
    const shiftedMonth = shiftedIndex % 12 + 1;
    if (shiftedYear < 1 || shiftedYear > 9999) return null;
    return `${pad(shiftedYear, 4)}-${pad(shiftedMonth)}`;
}

export function getLocalFinanceDate(date = new Date()) {
    return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalFinanceMonth(date = new Date()) {
    return getLocalFinanceDate(date).slice(0, 7);
}

export function getFinanceTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getFinanceDateInTimeZone(timeZone: unknown, date = new Date()) {
    const requestedTimeZone = typeof timeZone === 'string' ? timeZone.trim() : '';
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: requestedTimeZone || 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);
        const year = parts.find((part) => part.type === 'year')?.value;
        const month = parts.find((part) => part.type === 'month')?.value;
        const day = parts.find((part) => part.type === 'day')?.value;
        const normalized = normalizeFinanceDate(`${year}-${month}-${day}`);
        return normalized || getLocalFinanceDate(date);
    } catch {
        return getLocalFinanceDate(date);
    }
}

export function isFutureFinanceDate(value: unknown, today = getLocalFinanceDate()) {
    const date = normalizeFinanceDate(value);
    const currentDate = normalizeFinanceDate(today);
    return Boolean(date && currentDate && date > currentDate);
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
