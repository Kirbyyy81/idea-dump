import { describe, expect, it } from 'vitest';
import { getFinanceSettingsSection } from '@/app/finance/settings/sections';

describe('Finance settings section navigation', () => {
    it.each(['sources', 'categories', 'rules'] as const)(
        'selects the %s section from the URL',
        (section) => {
            expect(getFinanceSettingsSection(section)).toBe(section);
        }
    );

    it('uses the first value when a section query is repeated', () => {
        expect(getFinanceSettingsSection(['rules', 'sources'])).toBe('rules');
    });

    it.each([undefined, 'unknown', []])('falls back to sources for %j', (section) => {
        expect(getFinanceSettingsSection(section)).toBe('sources');
    });
});
