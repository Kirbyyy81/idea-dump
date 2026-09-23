import { expect, test } from '@playwright/test';
import { budgetDetailFixture } from '../fixtures/finance-budgets';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
});

test('dashboard rows share ledger styling without overflow', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    await page.goto('/finance');
    const rows = page.locator('[data-finance-transaction-row]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Merchant: Sample cafe');
    await expect(rows.first()).toContainText('-RM 12.30');
    await expect(rows.last()).toContainText('+RM 1,234.56');
    await rows.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('dashboard-rows.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('budget rows keep padded hover targets, amounts and edit links at narrow widths', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    const detail = budgetDetailFixture();
    detail.transactions.data = [{ id: 'transaction-1', merchant: 'A very long merchant name that should wrap inside this compact row', amount: '999999.99', direction: 'expense', transaction_date: '2026-09-21', source_name: 'Bank', category_name: 'Food' }];
    detail.transactions.total = 1;
    await page.addInitScript((detail) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = { list: { data: [detail.budget], page: 1, page_size: 20, total: 1 }, detail }; }, detail);
    await page.goto('/finance/budgets');
    await page.getByRole('heading', { name: 'Transactions', exact: true }).click();
    const row = page.locator('[data-finance-transaction-row="compact"]');
    await expect(row).toHaveAttribute('href', '/finance/transactions/edit?id=transaction-1');
    await expect(row).toContainText('-RM 999,999.99');
    await row.hover();
    await expect(row).toHaveCSS('padding-left', '12px');
    await expect(row).toHaveCSS('padding-right', '12px');
    await row.screenshot({ path: testInfo.outputPath('budget-row.png') });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.screenshot({ path: testInfo.outputPath('budget-row-zoom.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('review rows keep keyboard selection, duplicate warnings and candidate details', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    await page.goto('/finance/review');
    const selected = page.getByRole('button', { name: /Alex.*Possible duplicate/ });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Existing transaction', { exact: true })).toBeVisible();
    await expect(page.locator('[data-finance-transaction-row]')).toHaveCount(3);
    await selected.screenshot({ path: testInfo.outputPath('review-row.png') });
    const pending = page.getByRole('button', { name: /Pending merchant.*No amount/ });
    await pending.focus();
    await page.keyboard.press('Enter');
    await expect(pending).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Existing transaction', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
