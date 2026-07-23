const FINANCE_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const FINANCE_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FINANCE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_FINANCE_AMOUNT = 999_999_999_999.99;
export const MAX_FINANCE_NAME_LENGTH = 120;
export const MAX_FINANCE_MERCHANT_LENGTH = 500;
export const MAX_FINANCE_REFERENCE_LENGTH = 200;
export const MAX_FINANCE_NOTES_LENGTH = 2000;

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

export function getFinanceTransactionTextError(fields: {
    merchant?: unknown;
    reference_number?: unknown;
    notes?: unknown;
}) {
    const merchant = typeof fields.merchant === 'string' ? fields.merchant.trim() : '';
    const reference = typeof fields.reference_number === 'string' ? fields.reference_number.trim() : '';
    const notes = typeof fields.notes === 'string' ? fields.notes.trim() : '';

    if (merchant.length > MAX_FINANCE_MERCHANT_LENGTH) {
        return `Merchant must be ${MAX_FINANCE_MERCHANT_LENGTH} characters or fewer`;
    }
    if (reference.length > MAX_FINANCE_REFERENCE_LENGTH) {
        return `Reference number must be ${MAX_FINANCE_REFERENCE_LENGTH} characters or fewer`;
    }
    if (notes.length > MAX_FINANCE_NOTES_LENGTH) {
        return `Notes must be ${MAX_FINANCE_NOTES_LENGTH.toLocaleString('en-US')} characters or fewer`;
    }
    return null;
}
