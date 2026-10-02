import { expect, test } from '@playwright/test';

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
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expect(history.getByRole('heading', { name: 'Weekly groceries' }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(history).toContainText('No budget cycles for this month.');
});
