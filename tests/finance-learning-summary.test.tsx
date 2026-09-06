import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearningSummaryPanel } from '@/app/finance/settings/_components/LearningSummaryPanel';
import { toFinanceLearningSummary } from '@/lib/finance/core/payloads';
import type { FinanceLearningSummary } from '@/lib/types';

const availableSummary: FinanceLearningSummary = {
    availability: 'available',
    latest_run: {
        status: 'succeeded',
        finished_at: '2026-09-01T08:00:00.000Z',
        failure_code: null,
        corrections_examined: 7,
        category_rules_created: 1,
        category_rules_updated: 2,
        category_rules_disabled: 0,
        reference_rules_created: 1,
        reference_rules_updated: 0,
        reference_rules_disabled: 1,
    },
    template_counts: {
        active_source: 2,
        active_field: 3,
        proposed: 4,
        shadow: 5,
        rejected: 6,
        disabled: 7,
    },
    active_reference_rules: 8,
    active_metrics: [{
        field_name: 'reference_number',
        template_count: 2,
        minimum_precision: 1,
        average_coverage: 0.75,
    }],
    recent_outcomes: [{
        field_name: 'amount',
        status: 'disabled',
        reason: 'Contradictory reviewed evidence',
        updated_at: '2026-09-01T07:00:00.000Z',
    }],
};

describe('Finance learning summary payload', () => {
    it('accepts the bounded aggregate RPC result', () => {
        expect(toFinanceLearningSummary(JSON.parse(JSON.stringify(availableSummary))))
            .toEqual(availableSummary);
    });

    it('preserves the never-run state and rejects malformed or oversized content', () => {
        expect(toFinanceLearningSummary({ availability: 'never_run' }))
            .toEqual({ availability: 'never_run' });
        expect(toFinanceLearningSummary({
            ...availableSummary,
            recent_outcomes: [{
                field_name: 'amount',
                status: 'disabled',
                reason: 'x'.repeat(201),
                updated_at: '2026-09-01T07:00:00.000Z',
            }],
        })).toEqual({ availability: 'unavailable' });
        expect(toFinanceLearningSummary({ availability: 'available' }))
            .toEqual({ availability: 'unavailable' });
    });

    it('contains no private OCR or correction fields', () => {
        const serialized = JSON.stringify(toFinanceLearningSummary(availableSummary));
        expect(serialized).not.toContain('ocr_text');
        expect(serialized).not.toContain('original_filename');
        expect(serialized).not.toContain('previous_value');
        expect(serialized).not.toContain('corrected_value');
        expect(serialized).not.toContain('configuration');
    });
});

describe('LearningSummaryPanel', () => {
    it('renders active, shadow, gathering, rejected, disabled, and legacy states', () => {
        render(<LearningSummaryPanel isLoading={false} summary={availableSummary} />);
        expect(screen.getByText('Succeeded')).toBeTruthy();
        expect(screen.getByText('Active source')).toBeTruthy();
        expect(screen.getByText('Active field')).toBeTruthy();
        expect(screen.getByText('Shadow')).toBeTruthy();
        expect(screen.getByText('Gathering evidence')).toBeTruthy();
        expect(screen.getByText('Rejected')).toBeTruthy();
        expect(screen.getByText('Disabled')).toBeTruthy();
        expect(screen.getByText('8 active reference transforms')).toBeTruthy();
        expect(screen.getByText(/Reference number: 100% precision, 75% coverage/)).toBeTruthy();
        expect(screen.getByText(/Amount disabled/)).toBeTruthy();
        expect(screen.getByText(/Contradictory reviewed evidence/)).toBeTruthy();
    });

    it('renders never-run, unavailable, and loading states safely', () => {
        const view = render(
            <LearningSummaryPanel isLoading={false} summary={{ availability: 'never_run' }} />
        );
        expect(screen.getByText('No learning run has completed yet.')).toBeTruthy();

        view.rerender(
            <LearningSummaryPanel isLoading={false} summary={{ availability: 'unavailable' }} />
        );
        expect(screen.getByText('Learning status is unavailable. Rules remain available.')).toBeTruthy();

        view.rerender(<LearningSummaryPanel isLoading summary={availableSummary} />);
        expect(screen.getByText('Loading learning status...')).toBeTruthy();
        expect(screen.queryByText('Succeeded')).toBeNull();
    });
});
