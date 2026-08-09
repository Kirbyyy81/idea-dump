import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { detectFinanceSource } from '@/lib/finance/ocr/sourceDetection';
import type { FinanceRule, FinanceSource } from '@/lib/types';

const ryt: FinanceSource = {
    id: 'source-ryt',
    user_id: 'user-1',
    name: 'Ryt Bank',
    filename_aliases: ['Ryt Bank'],
    ocr_aliases: ['Ryt Bank'],
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

const other: FinanceSource = {
    ...ryt,
    id: 'source-other',
    name: 'Other Bank',
    filename_aliases: ['Other Bank'],
    ocr_aliases: ['Other Bank'],
};

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
});
