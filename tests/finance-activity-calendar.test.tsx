import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinanceActivityCalendar } from '@/app/finance/_components/FinanceActivityCalendar';

describe('daily activity calendar', () => {
    it.each([['2024-02', 29, 3], ['2025-02', 28, 5], ['2026-08', 31, 5], ['2026-11', 30, 6]])('renders every day of %s aligned to Monday', (month, count, offset) => {
        render(<FinanceActivityCalendar month={month} today="2026-12-31" items={[]} />);
        const calendar = screen.getByRole('group', { name: 'Daily activity calendar' });
        const buttons = within(calendar).getAllByRole('button');
        expect(buttons).toHaveLength(count);
        expect(Array.from(calendar.children).indexOf(buttons[0])).toBe(offset);
        expect(screen.getByText('No transactions this day.')).toBeTruthy();
    });

    it('keeps both flows, displays exact selected amounts and links to the selected date', () => {
        render(<FinanceActivityCalendar month="2026-09" today="2026-09-22" items={[
            { date: '2026-09-17', label: '17', income: 1234567.89, expense: 987.65 },
            { date: '2026-09-18', label: '18', income: 0.01, expense: 0.09 },
        ]} />);
        const day = screen.getByRole('button', { name: /^17 Sept 2026, income/ });
        expect(day.textContent).toContain('+1.2M');
        expect(day.textContent).toContain('−987.7');
        fireEvent.click(day);
        expect(day.getAttribute('aria-pressed')).toBe('true');
        const details = screen.getByRole('region', { name: 'Selected day' });
        expect(details.textContent).toMatch(/\+RM\s1,234,567\.89/);
        expect(details.textContent).toMatch(/−RM\s987\.65/);
        expect(within(details).getByRole('link').getAttribute('href')).toBe('/finance/transactions?date=2026-09-17');
        const small = screen.getByRole('button', { name: /^18 Sept 2026, income/ });
        expect(small.textContent).toContain('+<0.1');
        fireEvent.click(small);
        expect(details.textContent).toMatch(/\+RM\s0\.01/);
        expect(details.textContent).toMatch(/−RM\s0\.09/);
    });

    it('distinguishes empty past days, today and future dates without fabricating zeros for the future', () => {
        render(<FinanceActivityCalendar month="2026-09" today="2026-09-22" items={[]} />);
        const today = screen.getByRole('button', { name: /^22 Sept 2026/ });
        expect(today.getAttribute('aria-current')).toBe('date');
        expect(today.getAttribute('aria-pressed')).toBe('true');
        const future = screen.getByRole('button', { name: '23 Sept 2026, future date' });
        expect(future.hasAttribute('disabled')).toBe(true);
        expect(future.textContent).toBe('23');
        const past = screen.getByRole('button', { name: /^1 Sept 2026,/ });
        expect(past.textContent).toContain('+0');
        expect(past.textContent).toContain('−0');
    });

    it('shows a future month without activity values or transaction links', () => {
        render(<FinanceActivityCalendar month="2026-10" today="2026-09-22" items={[]} />);
        expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true);
        expect(screen.getByText('No activity yet.')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
