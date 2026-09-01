import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/atoms/Input';

describe('Input behavior', () => {
    it('associates its label, required state, and error with the input', () => {
        render(
            <Input
                id="amount"
                label="Amount"
                required
                errorMessage="Enter a valid amount"
                description="Use numbers only"
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
        expect(input.getAttribute('aria-describedby')).toBe(
            'amount-help amount-description amount-error'
        );
        expect(input.className).toContain('input');
        expect(input.className).toContain('border-error');
        expect(error.id).toBe('amount-error');
        expect(screen.getByText('Use numbers only').id).toBe('amount-description');
    });

    it('provides the string value while preserving a native change handler', () => {
        const onChange = vi.fn();
        const onValueChange = vi.fn();
        render(
            <Input
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
        render(<Input ref={ref} id="merchant" label="Merchant" />);

        expect(ref.current).toBe(screen.getByLabelText('Merchant'));
    });

    it('renders only the native input when field metadata is absent', () => {
        const { container } = render(<Input aria-label="Search" />);

        expect(container.firstElementChild).toBe(
            screen.getByRole('textbox', { name: 'Search' })
        );
    });
});
