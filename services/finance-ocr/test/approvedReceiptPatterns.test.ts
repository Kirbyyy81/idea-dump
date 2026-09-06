import { describe, expect, it } from 'vitest';
import { approvedReceiptValue, receiptDirectionConflict } from '@/lib/finance/ocr/receiptPatterns';
import { getFinanceParserTemplateConfigurationErrors } from '@/lib/finance/ocr/templateContract';

describe('approved receipt patterns', () => {
    it.each([
        ['tng_date', 'Date/Time 05/09/2026 12:22:34', '2026-09-05'],
        ['tng_date', 'Date & Time 05/09/2026 00:27:24', '2026-09-05'],
        ['ryt_date', '5 Sep 2026, 7.09 PM', '2026-09-05'],
        ['tng_date', 'Date/Time 31/02/2026 12:22:34', null],
        ['signed_direction', '-RM2.55 +2 points', 'expense'],
        ['signed_direction', '+RM40.30', 'income'],
        ['signed_direction', 'Transaction Type Transfer to Wallet', undefined],
        ['signed_direction', '+RM40.30\nTransaction Type Payment', null],
        ['signed_direction', '-RM40.30\nTransaction Type Receive from Wallet', null],
        ['tng_wallet_before', '2026090311121700010100171275872567\nWallet Ref 1"\n164', '2026090311121700010100171275872567'],
        ['tng_wallet_before', 'Amount 12.34\nWallet Ref', undefined],
        ['tng_wallet_wrapped', 'Wallet Ref ABC12345678901234567890\n71275836468129\nStatus Successful', 'ABC12345678901234567890 71275836468129'],
        ['tng_wallet_wrapped', 'Wallet Ref ABC12345678901234567890\n154\nStatus Successful', undefined],
        ['tng_wallet_wrapped', 'Wallet Ref ABC12345678901234567890\nStatus Successful\n71275836468129', undefined],
    ] as const)('extracts %s without broad inference', (pattern, text, expected) => {
        expect(approvedReceiptValue(text, pattern)).toBe(expected);
    });
    it('does not interpret reward points as incoming money', () => {
        expect(receiptDirectionConflict('-RM2.55 +2 points\nTransaction Type Payment')).toBe(false);
    });
    it('rejects mismatched fields and unknown patterns', () => {
        expect(getFinanceParserTemplateConfigurationErrors('merchant', { type: 'receipt_pattern', pattern: 'signed_direction' })).not.toEqual([]);
        expect(getFinanceParserTemplateConfigurationErrors('direction', { type: 'receipt_pattern', pattern: 'transfer_to_wallet' })).not.toEqual([]);
    });
});
