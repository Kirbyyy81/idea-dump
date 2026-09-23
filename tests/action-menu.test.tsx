import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/molecules/ActionMenu';

describe('action menu', () => {
    it('supports keyboard navigation, skips disabled actions and restores trigger focus', async () => {
        const edit = vi.fn();
        render(<ActionMenu label="Budget actions" items={[
            { label: 'Edit', onSelect: edit },
            { label: 'Archive', disabled: true, onSelect: vi.fn() },
            { label: 'Cycle history', onSelect: vi.fn() },
        ]} />);
        const trigger = screen.getByRole('button', { name: 'Budget actions' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' })));
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cycle history' }));
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(trigger);
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
        expect(edit).toHaveBeenCalledOnce();
        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('closes on outside interaction and when disabled', () => {
        const props = { label: 'Budget actions', items: [{ label: 'Edit', onSelect: vi.fn() }] };
        const { rerender } = render(<ActionMenu {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Budget actions' }));
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Budget actions' }));
        rerender(<ActionMenu {...props} disabled />);
        expect(screen.queryByRole('menu')).toBeNull();
        rerender(<ActionMenu {...props} />);
        expect(screen.queryByRole('menu')).toBeNull();
    });
});
