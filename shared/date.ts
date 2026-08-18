const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padDatePart(value: number, length = 2): string {
    return String(value).padStart(length, '0');
}

export function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

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

export function normalizeDate(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = DATE_PATTERN.exec(text);
    if (!match) return null;

    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

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

export function getLocalDate(date = new Date()): string {
    return `${padDatePart(date.getFullYear(), 4)}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function getLocalMonth(date = new Date()): string {
    return getLocalDate(date).slice(0, 7);
}

export function getLocalTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

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

export function isFutureDate(value: unknown, today = getLocalDate()): boolean {
    const date = normalizeDate(value);
    const currentDate = normalizeDate(today);
    return Boolean(date && currentDate && date > currentDate);
}
