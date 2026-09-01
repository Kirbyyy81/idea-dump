import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { Toggle } from '@/components/atoms/Toggle';

describe('shared form control fields', () => {
    it('associates Select labels, required state, and errors', () => {
        render(
            <Select
                id="source"
                label="Source"
                required
                errorMessage="Choose a source"
                value=""
                onChange={vi.fn()}
                options={[{ value: 'cash', label: 'Cash' }]}
            />
        );

        const select = screen.getByRole('combobox', { name: 'Source, required' });
        expect(select.getAttribute('aria-required')).toBe('true');
        expect(select.getAttribute('aria-invalid')).toBe('true');
        expect(select.getAttribute('aria-describedby')).toBe('source-error');
        expect(screen.getByText('Choose a source').id).toBe('source-error');
    });

    it('associates Textarea labels, native required state, and errors', () => {
        render(
            <Textarea
                id="notes"
                label="Notes"
                required
                errorMessage="Enter notes"
            />
        );

        const textarea = screen.getByRole('textbox', { name: 'Notes, required' });
        expect(textarea).toHaveProperty('required', true);
        expect(textarea.getAttribute('aria-invalid')).toBe('true');
        expect(textarea.getAttribute('aria-describedby')).toBe('notes-error');
    });

    it('associates Toggle state and errors without requiring a field label', () => {
        render(
            <Toggle
                id="confirm"
                toggleLabel="Confirm anyway"
                required
                errorMessage="Confirm this choice"
                checked={false}
                onChange={vi.fn()}
            />
        );

        const toggle = screen.getByRole('switch', { name: 'Confirm anyway' });
        expect(toggle.getAttribute('aria-required')).toBe('true');
        expect(toggle.getAttribute('aria-invalid')).toBe('true');
        expect(toggle.getAttribute('aria-describedby')).toBe('confirm-error');
    });
});
