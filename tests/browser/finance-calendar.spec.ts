import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
});

test('monthly calendar shows both flows and opens daily details without overflow', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    await page.goto('/finance');
    const calendar = page.getByRole('region', { name: 'Daily activity', exact: true });
    const days = calendar.getByRole('group', { name: 'Daily activity calendar' });
    await expect(days.getByRole('button')).toHaveCount(30);
    const activeDay = days.getByRole('button', { name: /^17 .*2026,/ });
    await expect(activeDay).toContainText('+650');
    await expect(activeDay).toContainText('−1.4K');
    await activeDay.click();
    const details = page.getByRole('region', { name: 'Selected day' });
    await expect(details).toContainText('+RM 650.00');
    await expect(details).toContainText('−RM 1,350.25');
    await expect(details.getByRole('link', { name: 'View transactions' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/finance\?month=2026-09&date=2026-09-17$/);
    const transactions = page.getByRole('region', { name: 'Transactions for 17 Sept 2026' });
    await expect(transactions).toContainText('Earlier day cafe');
    await expect(transactions).not.toContainText('Refund');
    await expect(transactions.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/finance/transactions?date=2026-09-17');
    await expect(days.getByRole('button', { name: /^23 .*future date/ })).toBeDisabled();
    const emptyDay = days.getByRole('button', { name: /^2 .*2026,/ });
    await emptyDay.focus();
    await page.keyboard.press('Enter');
    await expect(details.getByText('No transactions this day.')).toBeVisible();
    await expect(page.getByText('No transactions for this day.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear day filter' }).click();
    await expect(page.getByRole('region', { name: 'Recent transactions' })).toContainText('Refund');
    await expect(page).toHaveURL(/\/finance\?month=2026-09$/);
    await activeDay.click();
    const bounds = await activeDay.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(40);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page).toHaveURL(/\/finance\?month=2026-08$/);
    await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear day filter' })).toHaveCount(0);
    await calendar.screenshot({ path: testInfo.outputPath('activity-calendar.png') });
    await page.screenshot({ path: testInfo.outputPath('finance-dashboard.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.screenshot({ path: testInfo.outputPath('finance-zoom.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('category expansion is scrollable and does not stretch the dashboard row', async ({ page }, testInfo) => {
    await page.goto('/finance');
    const list = page.getByRole('list', { name: 'Spending categories' });
    await expect(list.getByRole('link')).toHaveCount(5);
    const section = page.getByRole('region', { name: 'Spending by category' });
    const before = await section.boundingBox();
    await page.getByRole('button', { name: 'View all 10 categories' }).click();
    await expect(list.getByRole('link')).toHaveCount(10);
    const after = await section.boundingBox();
    expect(after!.height - before!.height).toBeLessThanOrEqual(40);
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await list.focus();
    await page.keyboard.press('End');
    await list.getByRole('link').last().scrollIntoViewIfNeeded();
    await expect(list.getByRole('link').last()).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath('categories-expanded.png') });
    await page.getByRole('button', { name: 'Show fewer' }).click();
    await expect(list.getByRole('link')).toHaveCount(5);
});
