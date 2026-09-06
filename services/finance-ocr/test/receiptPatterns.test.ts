import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { receiptReferenceValue, screenshotFilenameDate } from '@/lib/finance/ocr/receiptPatterns';
import { extractFinanceReferenceNumber } from '@/lib/finance/ocr/reference';

describe('receipt filename dates', () => {
    it('uses the screenshot date for Today even when uploaded later', () => {
        expect(parseFinanceText('Today, 1:43 PM\n+RM 13.90', [], [], 'Screenshot_20260901_164928_Ryt Bank.png').payload.transaction_date).toBe('2026-09-01');
    });
    it('preserves an explicit transaction date', () => {
        expect(parseFinanceText('Date 31/08/2026\nToday, 1:43 PM', [], [], 'Screenshot_20260901_164928.png').payload.transaction_date).toBe('2026-08-31');
    });
    it.each(['Screenshot_20260230_120000.png', 'Screenshot_20260901_250000.png', 'receipt_20260901_120000.png', 'Screenshot_20260901120000.png'])('rejects an invalid or ambiguous filename: %s', (filename) => {
        expect(screenshotFilenameDate(filename)).toBeNull();
    });
    it('does not infer a date from incidental Today text or Yesterday', () => {
        for (const text of ['Yesterday, 1:43 PM', 'Offer ends today']) {
            expect(parseFinanceText(text, [], [], 'Screenshot_20260901_164928.png').payload.transaction_date).toBeNull();
        }
    });
});

describe('bounded receipt references', () => {
    it('joins a wrapped wallet reference without consuming the next field', () => {
        expect(extractFinanceReferenceNumber('Wallet Ref 2026090510110000010000TNGOW3MY1\n71275836921189\nStatus Successful\nTransaction No. TP26090500000635376603358')).toBe('2026090510110000010000TNGOW3MY171275836921189');
    });
    it('reads a value printed before Wallet Ref without appending short OCR noise', () => {
        expect(extractFinanceReferenceNumber('2026090311121700010100171275872567\nWallet Ref\n164\nStatus Successful')).toBe('2026090311121700010100171275872567');
    });
    it('retains a reviewed space join in a template', () => {
        expect(receiptReferenceValue('Wallet Ref ABC123456\n789012345', { type: 'reference_label', label: 'wallet ref', placement: 'inline', max_lines: 2, join: 'space' })).toBe('ABC123456 789012345');
    });
    it('does not cross a field boundary or accept two different references', () => {
        const config = { type: 'reference_label' as const, label: 'reference id' as const, placement: 'after' as const, max_lines: 1, join: 'concat' as const };
        expect(receiptReferenceValue('Reference ID\nStatus Successful\nABC123456', config)).toBeNull();
        expect(receiptReferenceValue('Reference ID\nABC123456\nReference ID\nXYZ987654', config)).toBeNull();
    });
});
