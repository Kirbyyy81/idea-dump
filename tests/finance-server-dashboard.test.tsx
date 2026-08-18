import fs from 'node:fs';
import path from 'node:path';
import { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceDashboardClient } from '@/app/finance/_components/FinanceDashboardClient';
import FinanceError from '@/app/finance/error';
import FinancePage from '@/app/finance/page';
import { resolveFinanceDashboardMonth } from '@/lib/finance/dashboard';
import { FinanceDashboardSummary } from '@/lib/types';

const {
    dashboardService,
    pageAccess,
    redirectTo,
    routerPush,
} = vi.hoisted(() => ({
    dashboardService: vi.fn(),
    pageAccess: vi.fn(),
    redirectTo: vi.fn((href: string) => {
        throw new Error(`redirect:${href}`);
    }),
    routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectTo,
    useRouter: () => ({ push: routerPush }),
}));
vi.mock('@/lib/finance/core/pageAccess', () => ({
    requireFinancePageAccess: pageAccess,
}));
vi.mock('@/lib/finance/core/service', () => ({
    getFinanceDashboard: dashboardService,
}));
vi.mock('@/components/organisms/AppShell', () => ({
    AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/atoms/MonthPicker', () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <button type="button" onClick={() => onChange('2026-06')}>Selected month {value}</button>
    ),
}));
vi.mock('recharts', () => {
    const ChartPart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return {
        Bar: ChartPart,
        BarChart: ChartPart,
        CartesianGrid: ChartPart,
        Cell: ChartPart,
        Pie: ChartPart,
        PieChart: ChartPart,
        ResponsiveContainer: ChartPart,
        Tooltip: ChartPart,
        XAxis: ChartPart,
        YAxis: ChartPart,
    };
});

const summary: FinanceDashboardSummary = {
    total_expense: 25,
    total_income: 100,
    net_cash_flow: 75,
    recent_transactions: [],
    expense_by_category: [{
        category_id: '20000000-0000-4000-8000-000000000001',
        label: 'Food',
        amount: 25,
    }],
    daily_cash_flow: [{
        date: '2026-05-01',
        label: '1',
        income: 100,
        expense: 25,
    }],
};

describe('server-rendered Finance dashboard', () => {
    beforeEach(() => {
        dashboardService.mockReset();
        pageAccess.mockReset();
        redirectTo.mockClear();
        routerPush.mockReset();
        pageAccess.mockResolvedValue({ user: { id: 'user-1' } });
        dashboardService.mockResolvedValue(summary);
    });

    it('resolves valid months and uses the Kuala Lumpur month by default', () => {
        const afterMalaysiaMidnight = new Date('2026-08-31T16:30:00.000Z');

        expect(resolveFinanceDashboardMonth(undefined, afterMalaysiaMidnight)).toEqual({
            defaultMonth: '2026-09',
            month: '2026-09',
        });
        expect(resolveFinanceDashboardMonth(['2026-05', '2026-04'], afterMalaysiaMidnight)).toEqual({
            defaultMonth: '2026-09',
            month: '2026-05',
        });
        expect(resolveFinanceDashboardMonth('2026-13', afterMalaysiaMidnight)).toEqual({
            defaultMonth: '2026-09',
            month: null,
        });
    });

    it('renders server-provided data and navigates months through the URL', () => {
        render(<FinanceDashboardClient month="2026-05" summary={summary} />);

        expect(screen.getAllByText('RM 100.00')).toHaveLength(2);
        expect(screen.getByRole('link', { name: /Food/ }).getAttribute('href'))
            .toContain('category_id=20000000-0000-4000-8000-000000000001');

        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        expect(routerPush).toHaveBeenLastCalledWith('/finance?month=2026-04');

        fireEvent.click(screen.getByRole('button', { name: 'Selected month 2026-05' }));
        expect(routerPush).toHaveBeenLastCalledWith('/finance?month=2026-06');
    });

    it('authorizes before loading the tenant-scoped dashboard summary', async () => {
        const page = await FinancePage({
            searchParams: Promise.resolve({ month: '2026-05' }),
        });

        expect(pageAccess).toHaveBeenCalledOnce();
        expect(dashboardService).toHaveBeenCalledWith('user-1', '2026-05');
        expect(page.type).toBe(FinanceDashboardClient);
        expect(page.props).toEqual({ month: '2026-05', summary });
    });

    it('authorizes before redirecting an invalid month', async () => {
        await expect(FinancePage({
            searchParams: Promise.resolve({ month: 'invalid' }),
        })).rejects.toThrow(/^redirect:\/finance\?month=\d{4}-\d{2}$/);

        expect(pageAccess).toHaveBeenCalledOnce();
        expect(dashboardService).not.toHaveBeenCalled();
        expect(pageAccess.mock.invocationCallOrder[0])
            .toBeLessThan(redirectTo.mock.invocationCallOrder[0]);
    });

    it('provides a retry action for dashboard failures', () => {
        const reset = vi.fn();
        render(<FinanceError error={new Error('private failure')} reset={reset} />);

        expect(screen.getByRole('alert').textContent).not.toContain('private failure');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(reset).toHaveBeenCalledOnce();
    });

    it('keeps auth request-scoped and removes the browser dashboard endpoint', () => {
        const root = path.resolve(import.meta.dirname, '..');
        const pageSource = fs.readFileSync(path.join(root, 'app', 'finance', 'page.tsx'), 'utf8');
        const clientSource = fs.readFileSync(path.join(
            root,
            'app',
            'finance',
            '_components',
            'FinanceDashboardClient.tsx'
        ), 'utf8');
        const layoutSource = fs.readFileSync(path.join(root, 'app', 'finance', 'layout.tsx'), 'utf8');
        const accessSource = fs.readFileSync(path.join(root, 'lib', 'finance', 'core', 'pageAccess.ts'), 'utf8');

        expect(pageSource).not.toMatch(/^['"]use client['"]/);
        expect(pageSource).toContain('getFinanceDashboard(session.user.id, month)');
        expect(clientSource).not.toContain('financeApiRequest');
        expect(clientSource).not.toContain('useEffect');
        expect(layoutSource).toContain('requireFinancePageAccess');
        expect(accessSource).toContain('cache(async () =>');
        expect(accessSource).toContain("import 'server-only'");
        expect(fs.existsSync(path.join(root, 'app', 'api', 'finance', 'dashboard', 'route.ts')))
            .toBe(false);
    });
});
