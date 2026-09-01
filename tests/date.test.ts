import { describe, expect, it } from 'vitest';
import { daysInMonth, isLeapYear, normalizeDate, toIsoDate } from '@/shared/date';

describe('shared date utilities', () => {
    it('applies Gregorian leap-year rules', () => {
        expect(isLeapYear(2024)).toBe(true);
        expect(isLeapYear(1900)).toBe(false);
        expect(isLeapYear(2000)).toBe(true);
    });

    it('returns the correct number of days for each month type', () => {
        expect(daysInMonth(2024, 2)).toBe(29);
        expect(daysInMonth(2025, 2)).toBe(28);
        expect(daysInMonth(2026, 4)).toBe(30);
        expect(daysInMonth(2026, 1)).toBe(31);
    });

    it('formats valid dates and rejects invalid calendar dates', () => {
        expect(toIsoDate(2024, 2, 29)).toBe('2024-02-29');
        expect(toIsoDate(2025, 2, 29)).toBeNull();
        expect(normalizeDate(' 2026-08-18 ')).toBe('2026-08-18');
        expect(normalizeDate('2026-04-31')).toBeNull();
    });
});
