export const FINANCE_SETTINGS_SECTIONS = ['sources', 'categories', 'rules'] as const;

export type FinanceSettingsSection = typeof FINANCE_SETTINGS_SECTIONS[number];

export function getFinanceSettingsSection(
    value: string | string[] | undefined
): FinanceSettingsSection {
    const section = Array.isArray(value) ? value[0] : value;
    return FINANCE_SETTINGS_SECTIONS.includes(section as FinanceSettingsSection)
        ? section as FinanceSettingsSection
        : 'sources';
}
