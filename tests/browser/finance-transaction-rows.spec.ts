import { expect, test } from '@playwright/test';
import { budgetDetailFixture } from '../fixtures/finance-budgets';
import { tagTransactions } from './finance-tags-fixture';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
});

test('dashboard rows share ledger styling without overflow', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
    await page.goto('/finance');
    const rows = page.locator('[data-finance-transaction-row]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute('data-finance-transaction-row', 'summary');
    await expect(rows.first().locator('[data-ledger-category-icon="food"]')).toHaveCount(1);
    await expect(rows.last().locator('[data-ledger-category-icon="income"]')).toHaveCount(1);
    await expect(rows.first()).not.toContainText('Bank');
    await expect(rows.last()).not.toContainText('Unknown source');
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

test('ledger double click opens editing while single click and selection stay on the ledger', async ({ page }) => {
    await page.goto('/finance/transactions');
    const row = page.locator('[data-finance-transaction-row="default"]').filter({ hasText: 'Trip cafe' });
    await row.getByText('Trip cafe', { exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/transactions$/);
    await page.getByRole('button', { name: 'Tag transactions', exact: true }).click();
    await page.getByRole('button', { name: 'Select transaction Trip cafe', exact: true }).dblclick();
    await expect(page).toHaveURL(/\/finance\/transactions$/);
    await row.getByText('Trip cafe', { exact: true }).dblclick();
    await expect(page).toHaveURL(`/finance/transactions/edit?id=${tagTransactions[0].id}`);
});

test('ledger three-dot menu still offers editing and deletion without double-click navigation', async ({ page }) => {
    await page.goto('/finance/transactions');
    const trigger = page.getByRole('button', { name: 'Actions for Trip cafe', exact: true });
    await trigger.dblclick();
    await expect(page).toHaveURL(/\/finance\/transactions$/);
    await trigger.click();
    const actions = page.getByRole('group', { name: 'Actions for Trip cafe', exact: true });
    await expect(actions.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/finance/transactions/edit?id=${tagTransactions[0].id}`);
    await actions.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(`/finance/transactions/edit?id=${tagTransactions[0].id}`);
});
