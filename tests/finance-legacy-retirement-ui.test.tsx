import { render, screen, within } from '@testing-library/react';
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
describe('retired rule library', () => {
    it('renders legacy rules without actions even if a stale server says active', async () => {
        render(<AlertProvider><RulesSettingsPanel /></AlertProvider>);
        expect(await screen.findByText('Retired legacy rule')).toBeTruthy();
        expect(screen.queryByRole('switch', { name: 'Pause rule learning rule' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete rule learning rule' })).toBeNull();
        expect(screen.queryByText('Stale suggestion')).toBeNull();
        expect(screen.queryByText('Compatibility rules')).toBeNull();
        expect(screen.getByRole('button', { name: 'Delete rule manual rule' })).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Rule library' })).queryByText('Learning suggestions')).toBeNull();
    });
});
