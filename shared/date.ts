const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a numeric date part to a zero-padded string.
 *
 * @param value - The numeric date part to format.
 * @param length - The minimum number of characters in the result.
 * @returns The formatted date part.
 */
function padDatePart(value: number, length = 2): string {
    return String(value).padStart(length, '0');
}

/**
 * Determines whether a year is a leap year in the Gregorian calendar.
 *
 * @param year - The full calendar year.
 * @returns `true` when the year has 366 days.
 */
export function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Gets the number of days in a calendar month.
 *
 * @param year - The full calendar year, used to determine February's length.
 * @param month - The one-based calendar month from 1 through 12.
 * @returns The number of days in the requested month.
 */
export function daysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Creates a validated ISO calendar date from numeric date parts.
 *
 * @param year - The full calendar year from 1 through 9999.
 * @param month - The one-based calendar month from 1 through 12.
 * @param day - The one-based day of the month.
 * @returns A `YYYY-MM-DD` string, or `null` when any part is invalid.
 */
export function toIsoDate(year: number, month: number, day: number): string | null {
    if (
        !Number.isInteger(year)
        || !Number.isInteger(month)
        || !Number.isInteger(day)
        || year < 1
        || year > 9999
        || month < 1
        || month > 12
        || day < 1
        || day > daysInMonth(year, month)
    ) {
        return null;
    }

    return `${padDatePart(year, 4)}-${padDatePart(month)}-${padDatePart(day)}`;
}

/**
 * Validates and normalizes an ISO calendar date string.
 *
 * Surrounding whitespace is ignored, but the value must otherwise use the
 * exact `YYYY-MM-DD` format and represent a real calendar date.
 *
 * @param value - The value to validate.
 * @returns The normalized date string, or `null` when the value is invalid.
 */
export function normalizeDate(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = DATE_PATTERN.exec(text);
    if (!match) return null;

    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Builds inclusive and exclusive boundaries for an ISO calendar month.
 *
 * @param value - A month in `YYYY-MM` format.
 * @returns The normalized month, its first day, and the first day of the next
 * month, or `null` when the value is invalid.
 */
export function getMonthRange(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = MONTH_PATTERN.exec(text);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1) return null;

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
        month: text,
        monthStart: `${padDatePart(year, 4)}-${padDatePart(month)}-01`,
        nextMonthStart: `${padDatePart(nextYear, Math.max(4, String(nextYear).length))}-${padDatePart(nextMonth)}-01`,
    };
}

/**
 * Shifts an ISO calendar month by a whole number of months.
 *
 * @param value - A month in `YYYY-MM` format.
 * @param offset - The integer number of months to add or subtract.
 * @returns The shifted `YYYY-MM` value, or `null` when the input or result is
 * outside the supported years from 1 through 9999.
 */
export function shiftMonth(value: unknown, offset: number): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = MONTH_PATTERN.exec(text);
    if (!match || !Number.isInteger(offset)) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const shiftedIndex = year * 12 + month - 1 + offset;
    const shiftedYear = Math.floor(shiftedIndex / 12);
    const shiftedMonth = shiftedIndex % 12 + 1;
    if (shiftedYear < 1 || shiftedYear > 9999) return null;
    return `${padDatePart(shiftedYear, 4)}-${padDatePart(shiftedMonth)}`;
}

/**
 * Formats a Date using the runtime's local calendar.
 *
 * @param date - The Date to format. Defaults to the current date and time.
 * @returns The local calendar date in `YYYY-MM-DD` format.
 */
export function getLocalDate(date = new Date()): string {
    return `${padDatePart(date.getFullYear(), 4)}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

/**
 * Formats a Date as a month using the runtime's local calendar.
 *
 * @param date - The Date to format. Defaults to the current date and time.
 * @returns The local calendar month in `YYYY-MM` format.
 */
export function getLocalMonth(date = new Date()): string {
    return getLocalDate(date).slice(0, 7);
}

/**
 * Gets the runtime's resolved local time-zone identifier.
 *
 * @returns The resolved IANA time-zone identifier, or `UTC` when unavailable.
 */
export function getLocalTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Gets the calendar date for an instant in a requested time zone.
 *
 * An empty or non-string time zone uses UTC. If the time zone cannot be
 * resolved, the function falls back to the runtime's local calendar date.
 *
 * @param timeZone - The requested IANA time-zone identifier.
 * @param date - The instant to format. Defaults to the current date and time.
 * @returns The calendar date in `YYYY-MM-DD` format.
 */
export function getDateInTimeZone(timeZone: unknown, date = new Date()): string {
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
        return normalizeDate(`${year}-${month}-${day}`) || getLocalDate(date);
    } catch {
        return getLocalDate(date);
    }
}

/**
 * Determines whether a valid ISO calendar date occurs after another date.
 *
 * @param value - The candidate date in `YYYY-MM-DD` format.
 * @param today - The comparison date. Defaults to the current local date.
 * @returns `true` only when both dates are valid and the candidate is later.
 */
export function isFutureDate(value: unknown, today = getLocalDate()): boolean {
    const date = normalizeDate(value);
    const currentDate = normalizeDate(today);
    return Boolean(date && currentDate && date > currentDate);
}
