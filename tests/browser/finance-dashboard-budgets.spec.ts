import { expect, test } from '@playwright/test';
import { budgetFixture } from '../fixtures/finance-budgets';

test('month navigation shows separate frozen cycles, current progress and empty history', async ({ page }, testInfo) => {
    await page.addInitScript(() => { (window as unknown as { dashboardBudgetMonths: boolean }).dashboardBudgetMonths = true; });
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    await page.goto('/finance?month=2026-10');
    await expect(page.getByRole('region', { name: 'Active budgets' })).toContainText('October groceries');
    await page.getByRole('button', { name: 'Previous month' }).focus();
    await page.keyboard.press('Enter');
    const history = page.getByRole('region', { name: 'Budget cycles' });
    await expect(history.getByRole('article')).toHaveCount(2);
    await expect(history).toContainText('14 to 20 Sept 2026');
    await expect(history).toContainText('21 to 27 Sept 2026');
    await expect(history).toContainText('RM 25.00 over');
    await expect(history).not.toContainText('October groceries');
    const meter = history.getByRole('meter').nth(1);
    const track = meter.locator(':scope > div');
    await expect(track).toHaveCount(1);
    const overlay = track.locator(':scope > div').nth(1);
    await expect(overlay).toHaveAttribute('style', 'width: 25%;');
    await expect(overlay).toHaveCSS('position', 'absolute');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expect(history.getByRole('heading', { name: 'Weekly groceries' }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(history).toContainText('No budget cycles for this month.');
});


test('one-time budgets stay visible and editable across reporting months', async ({ page }) => {
    const cycle = budgetFixture().current_cycle!;
    await page.addInitScript((cycle) => {
        Object.assign(window, { dashboardBudgetMonths: true, dashboardOneTimeBudgets: Array.from({ length: 4 }, (_, i) => ({
            budget_id: `once-${i}`, name: `Holiday ${i + 1}`, cycle: { ...cycle, id: `once-cycle-${i}`, start_date: null, end_date: null },
        })) });
    }, cycle);
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: { sources: [], categories: [], tags: [] } } }));
    for (const month of ['2026-10', '2026-08', '2026-12']) {
        await page.goto(`/finance?month=${month}`);
        for (let i = 0; i < 4; i++) {
            const link = page.getByRole('link', { name: new RegExp(`^Holiday ${i + 1}`) });
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute('href', `/finance/budgets?budget=once-${i}`);
            await expect(link).toContainText('One-time');
        }
    }
});
