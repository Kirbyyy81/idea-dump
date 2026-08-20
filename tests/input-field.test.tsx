import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputField } from '@/components/molecules/InputField';

describe('InputField', () => {
    it('associates its label, required state, and error with the input', () => {
        render(
            <InputField
                id="amount"
                label="Amount"
                required
                errorMessage="Enter a valid amount"
                aria-describedby="amount-help"
            />
        );

        const input = screen.getByRole('textbox', { name: 'Amount, required' }) as HTMLInputElement;
        const error = screen.getByText('Enter a valid amount');
        const requiredIndicator = screen.getByText('*');

        expect(input.id).toBe('amount');
        expect(input.required).toBe(true);
        expect(requiredIndicator.getAttribute('aria-hidden')).toBe('true');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe('amount-help amount-error');
        expect(input.className).toContain('input');
        expect(input.className).toContain('border-error');
        expect(error.id).toBe('amount-error');
    });

    it('provides the string value while preserving a native change handler', () => {
        const onChange = vi.fn();
        const onValueChange = vi.fn();
        render(
            <InputField
                id="amount"
                label="Amount"
                onChange={onChange}
                onValueChange={onValueChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Amount'), {
            target: { value: '12.50' },
        });

        expect(onChange).toHaveBeenCalledOnce();
        expect(onValueChange).toHaveBeenCalledWith('12.50');
    });

    it('forwards its ref to the underlying input', () => {
        const ref = createRef<HTMLInputElement>();
        render(<InputField ref={ref} id="merchant" label="Merchant" />);

        expect(ref.current).toBe(screen.getByLabelText('Merchant'));
    });
});
