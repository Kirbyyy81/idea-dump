import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { detectFinanceSource } from '@/lib/finance/ocr/sourceDetection';
import type { FinanceOcrSourceTemplate, FinanceRule, FinanceSource } from '@/lib/types';

const ryt: FinanceSource = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Ryt Bank',
    filename_aliases: ['Ryt Bank'],
    ocr_aliases: ['Ryt Bank'],
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

const other: FinanceSource = {
    ...ryt,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Other Bank',
    filename_aliases: ['Other Bank'],
    ocr_aliases: ['Other Bank'],
};

function sourceTemplate(
    source: FinanceSource,
    status: 'active' | 'shadow',
    overrides: Partial<FinanceOcrSourceTemplate> = {},
): FinanceOcrSourceTemplate {
    return {
        id: status === 'active'
            ? '33333333-3333-4333-8333-333333333333'
            : '44444444-4444-4444-8444-444444444444',
        user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        target_source_id: source.id,
        scope_source_id: null,
        field_name: 'source_id',
        template_type: 'source_phrase',
        configuration: { type: 'source_phrase', phrase: 'distinct transfer header', location: 'header' },
        algorithm_version: 1,
        template_version: 1,
        status,
        evidence_count: 5,
        contradiction_count: 0,
        evaluation_count: 5,
        precision: 1,
        coverage: 0.75,
        predecessor_template_id: null,
        status_reason: null,
        created_at: '2026-01-01T00:00:00Z',
        evaluated_at: '2026-01-02T00:00:00Z',
        activated_at: status === 'active' ? '2026-01-03T00:00:00Z' : null,
        disabled_at: null,
        updated_at: '2026-01-03T00:00:00Z',
        ...overrides,
    };
}

describe('Finance source evidence', () => {
    it('uses one unambiguous filename match as the source', () => {
        const result = detectFinanceSource('Transfer completed', 'Screenshot_Ryt_Bank.png', [ryt]);
        expect(result.sourceId).toBe(ryt.id);
        expect(result.signals.map((signal) => signal.kind)).toEqual(['filename_alias']);
    });

    it('resolves when filename and OCR evidence agree', () => {
        const result = detectFinanceSource('Ryt Bank transfer completed', 'Screenshot_Ryt_Bank.png', [ryt]);
        expect(result.sourceId).toBe(ryt.id);
        expect(result.signals.map((signal) => signal.kind).sort()).toEqual(['filename_alias', 'ocr_alias']);
    });

    it('keeps one filename match authoritative when OCR identifies another source', () => {
        const result = detectFinanceSource('Other Bank transfer completed', 'Screenshot_Ryt_Bank.png', [ryt, other]);
        expect(result.sourceId).toBe(ryt.id);
        expect(new Set(result.signals.map((signal) => signal.source_id))).toEqual(new Set([ryt.id, other.id]));
    });

    it('leaves a filename with multiple source matches unresolved', () => {
        const result = detectFinanceSource(
            'Ryt Bank transfer completed',
            'Screenshot_Ryt_Bank_Other_Bank.png',
            [ryt, other],
        );
        expect(result.sourceId).toBeNull();
        expect(new Set(result.signals
            .filter((signal) => signal.kind === 'filename_alias')
            .map((signal) => signal.source_id))).toEqual(new Set([ryt.id, other.id]));
    });

    it('falls back to one OCR source when the filename has no match', () => {
        const result = detectFinanceSource('Ryt Bank transfer completed', 'Screenshot.png', [ryt]);
        expect(result.sourceId).toBe(ryt.id);
        expect(result.signals.map((signal) => signal.kind)).toEqual(['ocr_alias']);
    });

    it('allows an OCR-text rule to assign a source when aliases do not match', () => {
        const rule: FinanceRule = {
            id: 'rule-1',
            user_id: 'user-1',
            name: 'Coffee transfer',
            match_type: 'keyword',
            pattern: 'coffee shop',
            category_id: null,
            source_id: ryt.id,
            direction: 'expense',
            priority: 1,
            is_active: true,
            source: 'manual',
            auto_created_at: null,
            learning_evidence_count: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        };
        const result = parseFinanceText(
            'Coffee Shop\nPaid RM 12.50\n15/07/2026',
            [rule],
            [ryt],
            'Screenshot.png',
        );
        expect(result.payload.source_id).toBe(ryt.id);
        expect(result.sourceDetectionSignals).toContainEqual(expect.objectContaining({
            source_id: ryt.id,
            kind: 'rule_match',
        }));
    });

    it('records a shadow source match without changing the baseline source', () => {
        const template = sourceTemplate(ryt, 'shadow');
        const result = parseFinanceText(
            'Distinct Transfer Header\nPaid RM 12.50\n15/07/2026',
            [],
            [ryt],
            'Screenshot.png',
            [],
            [],
            [template],
        );

        expect(result.payload.source_id).toBeNull();
        expect(result.sourceDetectionSignals).toContainEqual(expect.objectContaining({
            source_id: ryt.id,
            kind: 'learned_source_shadow',
            template_id: template.id,
            template_status: 'shadow',
        }));
    });

    it('uses an active learned template before a generic source-name match', () => {
        const genericRyt = { ...ryt, ocr_aliases: [] };
        const genericOther = { ...other, ocr_aliases: [] };
        const template = sourceTemplate(genericRyt, 'active');
        const result = detectFinanceSource(
            'Distinct Transfer Header\nOther Bank',
            'Screenshot.png',
            [genericRyt, genericOther],
            [template],
        );

        expect(result.sourceId).toBe(genericRyt.id);
        expect(result.signals).toContainEqual(expect.objectContaining({
            kind: 'learned_source_active',
            template_id: template.id,
        }));
    });

    it('does not let a learned template override an unambiguous filename alias', () => {
        const template = sourceTemplate(other, 'active');
        const result = detectFinanceSource(
            'Distinct Transfer Header',
            'Screenshot_Ryt_Bank.png',
            [ryt, other],
            [template],
        );

        expect(result.sourceId).toBe(ryt.id);
    });

    it('does not let a learned template override an unambiguous configured OCR alias', () => {
        const configuredRyt = { ...ryt, ocr_aliases: ['secure app banner'] };
        const template = sourceTemplate(other, 'active');
        const result = detectFinanceSource(
            'Distinct Transfer Header\nSecure App Banner',
            'Screenshot.png',
            [configuredRyt, other],
            [template],
        );

        expect(result.sourceId).toBe(configuredRyt.id);
    });

    it('keeps equal-rank learned source conflicts unresolved', () => {
        const rytTemplate = sourceTemplate(ryt, 'active');
        const otherTemplate = sourceTemplate(other, 'active', {
            id: '55555555-5555-4555-8555-555555555555',
        });
        const result = detectFinanceSource(
            'Distinct Transfer Header',
            'Screenshot.png',
            [{ ...ryt, ocr_aliases: [] }, { ...other, ocr_aliases: [] }],
            [rytTemplate, otherTemplate],
        );

        expect(result.sourceId).toBeNull();
        expect(result.hasConflict).toBe(true);
    });
});
