import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '@/components/molecules/Toast';

afterEach(() => vi.useRealTimers());

describe('toast notifications', () => {
    it('announces success and dismisses after five seconds', () => {
        vi.useFakeTimers();
        const dismiss = vi.fn();
        render(<Toast message="Budget saved" onDismiss={dismiss} />);
        expect(screen.getByRole('status').textContent).toBe('Budget saved');
        act(() => vi.advanceTimersByTime(4999));
        expect(dismiss).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('pauses dismissal while focused and allows manual dismissal', () => {
        vi.useFakeTimers();
        const dismiss = vi.fn();
        render(<Toast message="Budget saved" onDismiss={dismiss} />);
        const close = screen.getByRole('button', { name: 'Dismiss notification' });
        fireEvent.focus(close);
        act(() => vi.advanceTimersByTime(10000));
        expect(dismiss).not.toHaveBeenCalled();
        fireEvent.click(close);
        expect(dismiss).toHaveBeenCalledOnce();
    });
});
