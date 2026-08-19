export const FINANCE_ENTRY_MODES = ['manual', 'screenshot'] as const;

export type FinanceEntryMode = typeof FINANCE_ENTRY_MODES[number];

export function getFinanceEntryMode(
    value: string | string[] | undefined
): FinanceEntryMode {
    if (Array.isArray(value)) return 'screenshot';
    return FINANCE_ENTRY_MODES.includes(value as FinanceEntryMode)
        ? value as FinanceEntryMode
        : 'screenshot';
}
