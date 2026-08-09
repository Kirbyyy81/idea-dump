import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { extractFinanceReferenceNumber } from '@/lib/finance/ocr/reference';

describe('Finance reference extraction', () => {
    it.each(['9', '&', '@', '>', '&®', '('])(
        'skips the OCR copy-icon artifact %s after Reference ID',
        (artifact) => {
            expect(extractFinanceReferenceNumber(
                `Reference ID ${artifact} 202607241234ABC`,
            )).toBe('202607241234ABC');
        },
    );

    it('does not backtrack and capture the tail of REFERENCE', () => {
        expect(extractFinanceReferenceNumber(
            'REFERENCE ID 9 202607241234ABC',
        )).not.toBe('ERENCE');
    });

    it('prefers an explicit Reference ID label over a bare Reference label', () => {
        expect(extractFinanceReferenceNumber([
            'Reference ABC12345',
            'Reference ID 9 202607241234ABC',
        ].join('\n'))).toBe('202607241234ABC');
    });

    it('prefers the longer candidate associated with one label', () => {
        expect(extractFinanceReferenceNumber(
            'Reference ID ABC123 202607241234ABC',
        )).toBe('202607241234ABC');
    });

    it('reads a reference from the next non-empty line', () => {
        expect(extractFinanceReferenceNumber([
            'Reference No.',
            '',
            'COPY',
            'TXN-123456',
        ].join('\n'))).toBe('TXN-123456');
    });

    it('stops multiline lookup at another field label', () => {
        expect(extractFinanceReferenceNumber([
            'Reference ID',
            'Amount RM 12345.67',
        ].join('\n'))).toBeNull();
    });

    it('returns null for equally ranked conflicting references', () => {
        expect(extractFinanceReferenceNumber(
            'Reference ID ABC12345 XYZ67890',
        )).toBeNull();
    });

    it('normalizes full-width and lowercase reference text', () => {
        expect(extractFinanceReferenceNumber(
            'reference id ９ ａｂｃ１２３４５',
        )).toBe('ABC12345');
    });

    it('preserves a fused artifact for source-scoped learned correction', () => {
        expect(extractFinanceReferenceNumber(
            'Reference ID O202607241234ABC',
        )).toBe('O202607241234ABC');
    });

    it('passes the selected reference through the parser contract', () => {
        const parsed = parseFinanceText(
            'Paid RM 12.50\nReference ID 9 202607241234ABC\n15/07/2026',
            [],
            [],
            'Screenshot.png',
        );
        expect(parsed.payload.reference_number).toBe('202607241234ABC');
    });
});
