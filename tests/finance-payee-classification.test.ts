import { describe, expect, it } from 'vitest';
import { setFinancePayeeClassification } from '@/lib/finance/transactions/payeeClassification';

describe('Finance payee classification', () => {
    it('moves an extracted merchant into the payee when classified as a payee', () => {
        expect(setFinancePayeeClassification({
            merchant: 'CHIN YONG HAO',
            has_payee: false,
            payee_name: '',
        }, true)).toEqual({
            merchant: '',
            has_payee: true,
            payee_name: 'CHIN YONG HAO',
        });
    });

    it('preserves separate merchant and payee values when both are already known', () => {
        expect(setFinancePayeeClassification({
            merchant: 'Coffee Shop',
            has_payee: false,
            payee_name: 'CHIN YONG HAO',
        }, true)).toEqual({
            merchant: 'Coffee Shop',
            has_payee: true,
            payee_name: 'CHIN YONG HAO',
        });
    });

    it('moves the payee back to an empty merchant when the classification is removed', () => {
        expect(setFinancePayeeClassification({
            merchant: '',
            has_payee: true,
            payee_name: 'CHIN YONG HAO',
        }, false)).toEqual({
            merchant: 'CHIN YONG HAO',
            has_payee: false,
            payee_name: '',
        });
    });

    it('does not overwrite a separately entered merchant when the classification is removed', () => {
        expect(setFinancePayeeClassification({
            merchant: 'Coffee Shop',
            has_payee: true,
            payee_name: 'CHIN YONG HAO',
        }, false)).toEqual({
            merchant: 'Coffee Shop',
            has_payee: false,
            payee_name: '',
        });
    });
});
