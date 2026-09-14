import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LearningSummaryPanel } from '@/app/finance/settings/_components/LearningSummaryPanel';
import { ShadowRulesList } from '@/app/finance/settings/_components/ShadowRulesList';
import { financeShadowSourceIds, toFinanceShadowRules } from '@/lib/finance/shadowRules';

const row = {
    id: 'template-1', target_source_id: null, scope_source_id: 'bank-1',
    field_name: 'reference_number', template_type: 'bounded_line_window',
    algorithm_version: 3, template_version: 2, evidence_count: 4,
    evaluation_count: 5, contradiction_count: 0, precision: '1.000000', coverage: '0.500000',
    shadow_started_at: '2026-09-14T08:00:00Z', evaluated_at: '2026-09-14T08:30:00Z',
};
const sources = [{ id: 'bank-1', name: 'Example bank' }];
const unavailable = { availability: 'unavailable' };

describe('shadow-rule browser projection', () => {
    it('exposes only display metadata, with normalized metrics and no raw configuration', () => {
        const summary = toFinanceShadowRules([{
            ...row, configuration: { anchor: 'SECRET' }, status_reason: 'SECRET',
            user_id: 'SECRET', value_hash: 'SECRET', corrected_value: 'SECRET', ocr_text: 'SECRET',
        }], sources, 1);
        expect(summary).toEqual({ availability: 'available', total: 1, rules: [{
            id: 'template-1', source_name: 'Example bank', field_name: 'reference_number',
            template_type: 'bounded_line_window', algorithm_version: 3, template_version: 2,
            evidence_count: 4, evaluation_count: 5, contradiction_count: 0,
            precision: 1, coverage: 0.5, shadow_started_at: row.shadow_started_at, evaluated_at: row.evaluated_at,
        }] });
        expect(JSON.stringify(summary)).not.toContain('SECRET');
    });

    it('resolves source targets separately from field scopes and hides missing source names', () => {
        const result = toFinanceShadowRules([
            { ...row, field_name: 'source_id', template_type: 'source_phrase', algorithm_version: 2,
                target_source_id: 'bank-1', scope_source_id: 'foreign-source' },
            { ...row, id: 'template-2', scope_source_id: 'foreign-source' },
        ], sources, 2);
        if (result.availability !== 'available') throw new Error('Expected available');
        expect(result.rules.map((rule) => rule.source_name)).toEqual(['Example bank', null]);
        expect(financeShadowSourceIds([row, row, null])).toEqual(['bank-1']);
    });

    it.each([
        { algorithm_version: 4 }, { template_version: 0 }, { field_name: 'constructor' },
        { template_type: '__proto__' }, { evidence_count: -1 }, { evaluation_count: null },
        { contradiction_count: 0.5 }, { precision: 1.1 }, { coverage: '' },
        { precision: false }, { evaluated_at: 'invalid' }, { shadow_started_at: undefined },
    ])('fails safely on malformed metadata %j', (change) => {
        expect(toFinanceShadowRules([{ ...row, ...change }], sources, 1)).toEqual(unavailable);
    });

    it('handles nullable metrics, empty lists and bounded responses', () => {
        expect(toFinanceShadowRules([], [], 0)).toEqual({ availability: 'available', total: 0, rules: [] });
        expect(toFinanceShadowRules([{ ...row, precision: null, coverage: null, evaluated_at: null }], sources, 1).availability).toBe('available');
        expect(toFinanceShadowRules([row], sources, null)).toEqual(unavailable);
        expect(toFinanceShadowRules([row], sources, 0)).toEqual(unavailable);
        expect(toFinanceShadowRules(Array(101).fill(row), sources, 101)).toEqual(unavailable);
    });
});

describe('shadow-rule settings list', () => {
    it('offers a read-only refresh and disables it while loading', () => {
        const refresh = vi.fn();
        const view = render(<LearningSummaryPanel isLoading={false} summary={{ availability: 'never_run' }} onRefresh={refresh} />);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh learning status' }));
        expect(refresh).toHaveBeenCalledOnce();
        view.rerender(<LearningSummaryPanel isLoading summary={{ availability: 'never_run' }} onRefresh={refresh} />);
        expect((screen.getByRole('button', { name: 'Refresh learning status' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows individual rules and explains that evidence is not activation approval', () => {
        render(<ShadowRulesList summary={toFinanceShadowRules([row], sources, 1)} />);
        expect(screen.getByText('Example bank: Reference number')).toBeTruthy();
        expect(screen.queryByText('Read nearby lines around a label')).toBeNull();
        expect(screen.getByText('Algorithm 3 · Version 2')).toBeTruthy();
        expect(screen.queryByText(/These rules are being tested/)).toBeNull();
        expect(screen.queryByText(/Algorithm is the extraction-logic version/)).toBeNull();
        expect(screen.getByText(/not just fresh shadow reviews/)).toBeTruthy();
        expect(screen.getByText('100%')).toBeTruthy();
        expect(screen.getByText('50%')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
    });

    it('paginates with accessible buttons and clamps the page after a refresh', () => {
        const rows = Array.from({ length: 7 }, (_, index) => ({ ...row, id: `template-${index}` }));
        const view = render(<ShadowRulesList summary={toFinanceShadowRules(rows, sources, 7)} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(5);
        expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText('Showing 6-7 of 7 shadow rules.')).toBeTruthy();
        view.rerender(<ShadowRulesList summary={toFinanceShadowRules([row], sources, 1)} />);
        expect(screen.getByText('Showing 1-1 of 1 shadow rules.')).toBeTruthy();
    });

    it('omits filename-date descriptions while retaining compact rule metadata', () => {
        render(<ShadowRulesList summary={toFinanceShadowRules([{
            ...row, field_name: 'transaction_date', template_type: 'filename_date', algorithm_version: 2,
        }], sources, 1)} />);
        expect(screen.getByRole('heading', { name: 'Example bank: Transaction date' })).toBeTruthy();
        expect(screen.queryByText('Read the date from the filename')).toBeNull();
        expect(screen.getByText('Algorithm 2 · Version 2')).toBeTruthy();
        expect(screen.getByText('Supporting transactions:')).toBeTruthy();
        expect(screen.getByText('Evaluations:')).toBeTruthy();
        expect(screen.getByText(/Testing since/)).toBeTruthy();
        expect(screen.getByRole('list').className).toContain('divide-y');
        expect(screen.getByRole('listitem').className).toContain('py-2');
    });

    it('shows loading, empty, unavailable and partial-summary states independently', () => {
        const view = render(<LearningSummaryPanel isLoading summary={{ availability: 'unavailable' }}
            shadowRules={toFinanceShadowRules([row], sources, 1)} />);
        expect(screen.queryByText('Rules in shadow testing')).toBeNull();
        view.rerender(<LearningSummaryPanel isLoading={false} summary={{ availability: 'unavailable' }}
            shadowRules={toFinanceShadowRules([row], sources, 1)} />);
        expect(screen.getByText('Example bank: Reference number')).toBeTruthy();
        view.rerender(<ShadowRulesList summary={toFinanceShadowRules([], [], 0)} />);
        expect(screen.getByText('No rules are currently in shadow testing.')).toBeTruthy();
        view.rerender(<ShadowRulesList summary={{ availability: 'unavailable' }} />);
        expect(screen.getByText(/Shadow rule details are unavailable/)).toBeTruthy();
    });
});
