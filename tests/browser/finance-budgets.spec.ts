import { expect, test, type Page } from '@playwright/test';
import { budgetDetailFixture, budgetFixture } from '../fixtures/finance-budgets';
import type { FinanceBudgetSummary } from '../../lib/types';

const sourceId = 'b0110000-0000-4000-8000-000000000011';
async function references(page: Page) {
    await page.clock.install({ time: new Date('2026-09-14T04:00:00Z') });
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [{ id: sourceId, name: 'Bank' }], categories: [] } } }));
}

test('simple calendar budget defaults and optional customization', async ({ page }, testInfo) => {
    await references(page);
    let created: FinanceBudgetSummary | null = null;
    let body: Record<string, unknown> = {};
    await page.route('**/api/finance/budgets**', async (route) => {
        if (route.request().method() === 'POST') {
            body = route.request().postDataJSON();
            const configuration = body.configuration as FinanceBudgetSummary['version'];
            created = budgetFixture({ name: configuration.name, version: { ...budgetFixture().version, ...configuration } });
            await route.fulfill({ json: { data: created } });
        } else if (new URL(route.request().url()).pathname === '/api/finance/budgets') {
            await route.fulfill({ json: { data: created ? [created] : [], page: 1, page_size: 20, total: created ? 1 : 0 } });
        } else await route.fulfill({ json: { data: budgetDetailFixture(created!) } });
    });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Create budget' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create budget' });
    await expect(dialog.getByLabel('Cycle', { exact: true })).toHaveText('Monthly (starts from 1st of the month)');
    await expect(dialog.getByText('Start date', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('switch')).toHaveCount(0);
    await dialog.getByLabel('Cycle', { exact: true }).click();
    await expect(page.getByRole('option', { name: 'Custom', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Weekly (starts on Monday)', exact: true }).click();
    await expect(dialog.getByLabel('Cycle', { exact: true })).toHaveText('Weekly (starts on Monday)');
    await dialog.getByLabel('Cycle', { exact: true }).click();
    await page.getByRole('option', { name: 'Monthly (starts from 1st of the month)', exact: true }).click();
    await dialog.getByLabel('Name').fill('Monthly budget');
    await dialog.getByLabel('Budget amount (MYR)').fill('500');
    await page.screenshot({ path: testInfo.outputPath('simple-monthly-budget.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Create budget', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Monthly budget details' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Budget saved' })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.getByText('Budget saved', { exact: true })).toHaveCount(0);
    expect(body).toMatchObject({ configuration: { cycle_type: 'monthly', start_date: '2026-09-01', anchor_day: 1, amount: '500.00', source_ids: [], category_ids: [] } });
});

test('custom dates and durations remain available without losing edits', async ({ page }) => {
    await references(page);
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Create budget' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create budget' });
    await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
    await dialog.getByRole('button', { name: /^Start date,/ }).click();
    await page.getByRole('button', { name: 'Thursday, September 10, 2026', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Start date,/ })).toContainText('10 Sept 2026');
    await dialog.getByRole('button', { name: 'Hide customization' }).click();
    await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Start date,/ })).toContainText('10 Sept 2026');
    await dialog.getByLabel('Cycle', { exact: true }).click();
    await page.getByRole('option', { name: 'Custom', exact: true }).click();
    await dialog.getByLabel('Days per cycle').fill('10');
    await dialog.getByRole('button', { name: 'Hide customization' }).click();
    await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
    await expect(dialog.getByLabel('Days per cycle')).toHaveValue('10');
});

test('create, edit, archive, frozen history and restore', async ({ page }, testInfo) => {
    await references(page);
    let budget: FinanceBudgetSummary | null = null;
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/finance/budgets**', async (route) => {
        const request = route.request();
        if (request.method() !== 'GET') {
            const body = request.postDataJSON(); bodies.push(body);
            if (body.action === 'archive') budget = budgetFixture({ state: 'archived', status: 'archived', current_cycle: null, revision: 3 });
            else budget = budgetFixture({ name: body.configuration.name, revision: body.action === 'restore' ? 4 : budget ? 2 : 1,
                version: { ...budgetFixture().version, ...body.configuration } });
            await route.fulfill({ json: { data: budget } }); return;
        }
        const url = new URL(request.url());
        if (url.pathname === '/api/finance/budgets') {
            const data = budget && url.searchParams.get('state') === budget.state ? [budget] : [];
            await route.fulfill({ json: { data, page: 1, page_size: 20, total: data.length } });
        } else {
            const detail = budgetDetailFixture(budget!);
            if (budget!.revision >= 3) detail.history = { data: [{ ...budgetFixture().current_cycle!, state: 'partial', close_reason: 'archived', frozen_at: '2026-09-14T04:00Z', end_date: '2026-09-15' }], page: 1, page_size: 20, total: 1 };
            await route.fulfill({ json: { data: detail } });
        }
    });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Create budget' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create budget' });
    await dialog.getByLabel('Name').fill('Everyday spending');
    await dialog.getByLabel('Budget amount (MYR)').fill('100');
    await dialog.getByLabel('Cycle', { exact: true }).click();
    await page.getByRole('option', { name: 'Weekly (starts on Monday)', exact: true }).click();
    await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
    await dialog.getByRole('switch', { name: 'Bank' }).click();
    await dialog.getByRole('switch', { name: 'Uncategorised' }).click();
    await dialog.getByLabel('Match sources and categories').click();
    await page.getByRole('option', { name: 'OR: match either selection' }).click();
    await dialog.getByRole('button', { name: 'Create budget', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Everyday spending details' })).toBeVisible();
    const transactionsToggle = page.locator('summary').filter({ hasText: 'Current transactions' });
    await expect(page.getByText('No matching transactions this cycle.')).not.toBeVisible();
    await transactionsToggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('No matching transactions this cycle.')).toBeVisible();
    await transactionsToggle.click();
    await expect(page.getByText('No matching transactions this cycle.')).not.toBeVisible();
    expect(bodies[0]).toMatchObject({ request_id: expect.any(String), configuration: { amount: '100.00', cycle_type: 'weekly', source_ids: [sourceId], include_uncategorised: true, filter_logic: 'or' } });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Budget amount (MYR)').fill('200');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(bodies[1]).toMatchObject({ revision: 1, configuration: { amount: '200.00' } });
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive budget' }).click();
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
    await page.getByRole('region', { name: 'Cycle history' }).locator('summary').click();
    await expect(page.getByText('Expenses', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore budget', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    expect(bodies[3]).toMatchObject({ action: 'restore', revision: 3, configuration: { start_date: '2026-09-14' } });
    await page.screenshot({ path: testInfo.outputPath('budget-lifecycle.png'), fullPage: true });
});

test('missing references require an explicit repair and conflicts retain input', async ({ page }) => {
    await references(page);
    const budget = budgetFixture({ state: 'archived', status: 'archived', current_cycle: null });
    budget.version.sources = [{ id: null, original_id: sourceId, name: 'Deleted bank', is_archived: false }];
    await page.addInitScript((budget) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = { list: { data: [budget], page: 1, page_size: 20, total: 1 }, detail: { budget, history: { data: [], page: 1, page_size: 20, total: 0 }, transactions: { data: [], page: 1, page_size: 50, total: 0 } } }; }, budget);
    let body: Record<string, unknown> = {};
    await page.route('**/api/finance/budgets/**', async (route) => { body = route.request().postDataJSON(); await route.fulfill({ status: 409, json: { error: 'This budget changed. Reload and retry.' } }); });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByText('Remove or replace deleted selections before restoring.')).toBeVisible();
    await page.getByRole('switch', { name: 'Deleted bank (deleted)' }).click();
    await page.getByLabel('Name').fill('Repaired budget');
    await page.getByRole('dialog').getByRole('button', { name: 'Restore budget' }).click();
    await expect(page.getByRole('alert')).toContainText('This budget changed');
    await expect(page.getByLabel('Name')).toHaveValue('Repaired budget');
    await expect(page.getByRole('button', { name: 'Reload budget', exact: true })).toBeVisible();
    expect(body).toMatchObject({ configuration: { source_ids: [] } });
});

test('keyboard focus, Escape, validation, and 200 percent reflow', async ({ page }, testInfo) => {
    await references(page);
    await page.goto('/finance/budgets');
    const trigger = page.getByRole('button', { name: 'Create budget' }).first();
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Create budget' }).click();
    await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await page.screenshot({ path: testInfo.outputPath('budget-200-percent.png'), fullPage: true });
});
