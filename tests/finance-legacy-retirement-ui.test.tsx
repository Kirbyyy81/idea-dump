import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RulesSettingsPanel } from '@/app/finance/settings/_components/RulesSettingsPanel';
import { AlertProvider } from '@/lib/contexts/AlertContext';
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({
    useFinanceReferenceData: () => ({ sources: [], categories: [], status: 'ready', upsertCategory: vi.fn() }),
}));
vi.mock('@/lib/finance/core/client', () => ({ financeApiRequest: vi.fn().mockResolvedValue({
    data: ['learning', 'manual'].map((source) => ({ id: source, name: source + ' rule', source, is_active: true, match_type: 'keyword', pattern: 'shop', priority: 1, created_at: '2026-01-01T00:00:00Z' })),
    suggestions: [{ id: 'stale', name: 'Stale suggestion' }], learning: { availability: 'never_run' },
}) }));
describe('Finance settings without the rule library', () => {
    it('omits the library while preserving learning and rule creation', async () => {
        render(<AlertProvider><RulesSettingsPanel /></AlertProvider>);
        expect(await screen.findByText('No learning run has completed yet.')).toBeTruthy();
        expect(screen.queryByRole('region', { name: 'Rule library' })).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Rule library' })).toBeNull();
        expect(screen.queryByText('Retired legacy rule')).toBeNull();
        expect(screen.queryByText('learning rule')).toBeNull();
        expect(screen.queryByText('manual rule')).toBeNull();
        expect(screen.queryByRole('switch', { name: 'Pause rule learning rule' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete rule learning rule' })).toBeNull();
        expect(screen.queryByText('Stale suggestion')).toBeNull();
        expect(screen.queryByText('Compatibility rules')).toBeNull();
        expect(screen.getByRole('button', { name: 'Add rule' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Notification patterns' })).toBeTruthy();
    });
});
