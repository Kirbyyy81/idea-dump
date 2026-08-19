import { describe, expect, it } from 'vitest';
import { getFinanceEntryMode } from '@/app/finance/add/entryMode';

describe('Finance transaction entry mode', () => {
    it.each([
        ['manual', 'manual'],
        ['screenshot', 'screenshot'],
    ] as const)('opens the requested %s workflow', (value, expected) => {
        expect(getFinanceEntryMode(value)).toBe(expected);
    });

    it.each([
        undefined,
        'unknown',
        [],
        ['manual', 'screenshot'],
    ])('defaults to screenshot for %j', (value) => {
        expect(getFinanceEntryMode(value)).toBe('screenshot');
    });
});
