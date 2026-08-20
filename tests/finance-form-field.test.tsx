import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/atoms/Input';
import { FinanceFormField } from '@/app/finance/_components/FinanceFormField';

describe('FinanceFormField', () => {
    it('shows an accessible required indicator', () => {
        render(
            <FinanceFormField fieldId="amount" label="Amount" required>
                <Input id="amount" />
            </FinanceFormField>
        );

        expect(screen.getByRole('textbox', { name: 'Amount, required' })).toBeTruthy();
        expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    });
});
