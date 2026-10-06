import { expect, test, type Page } from '@playwright/test';
import { budgetDetailFixture, budgetFixture } from '../fixtures/finance-budgets';
import type { FinanceBudgetSummary } from '../../lib/types';
import { calculateBudgetMetrics } from '../../lib/finance/budgets/calculations';

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
            const configuration = body.configuration as FinanceBudgetSummary['configuration'];
            created = budgetFixture({ name: configuration.name, configuration: { ...budgetFixture().configuration, ...configuration } });
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
    await expect(page.getByRole('region', { name: 'Monthly budget details' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View Monthly budget' }).click();
    await expect(page.getByRole('region', { name: 'Monthly budget details' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Budget saved' })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.getByText('Budget saved', { exact: true })).toHaveCount(0);
    expect(body).toMatchObject({ configuration: { cycle_type: 'monthly', start_date: '2026-09-01', anchor_day: 1, amount: '500.00', source_ids: [], category_ids: [] } });
});

test('excess spending animates over the base within one track', async ({ page }, testInfo) => {
    await references(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const budget = budgetFixture({ status: 'over_budget' });
    budget.current_cycle!.metrics = { ...budget.current_cycle!.metrics, net_spending: '125.00', used_amount: '125.00', over_amount: '25.00', remaining: '0.00', usage_percentage: '125.000000' };
    await page.addInitScript((detail) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = {
        list: { data: [detail.budget], page: 1, page_size: 20, total: 1 }, detail,
    }; }, budgetDetailFixture(budget));
    await page.goto('/finance/budgets');
    const details = page.getByRole('region', { name: 'Everyday spending details' });
    const meter = details.getByRole('meter');
    const tracks = meter.locator(':scope > div');
    await expect(tracks).toHaveCount(1);
    const firstFill = tracks.locator(':scope > div').nth(0);
    const overflowFill = tracks.locator(':scope > div').nth(1);
    for (const fill of [firstFill, overflowFill]) {
        await expect(fill).toHaveCSS('animation-name', 'budgetFill');
        await expect(fill).toHaveCSS('animation-duration', '0.45s');
        await expect(fill).toHaveCSS('animation-iteration-count', '1');
        const scales = await fill.evaluate((element) => {
            const animation = element.getAnimations()[0];
            animation.pause();
            const values = [0, 225, 450].map((time) => {
                animation.currentTime = time;
                return new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
            });
            animation.finish();
            return values;
        });
        expect(scales[0]).toBe(0);
        expect(scales[1]).toBeGreaterThan(0);
        expect(scales[1]).toBeLessThan(1);
        expect(scales[2]).toBe(1);
    }
    await expect(firstFill).toHaveAttribute('style', 'width: 100%;');
    await expect(overflowFill).toHaveAttribute('style', 'width: 25%;');
    await expect(overflowFill).toHaveCSS('filter', 'brightness(0.75)');
    const firstBounds = await tracks.nth(0).boundingBox();
    const overflowBounds = await overflowFill.boundingBox();
    expect(overflowBounds!.width).toBeCloseTo(firstBounds!.width / 4, 0);
    expect(overflowBounds!.x).toBeCloseTo(firstBounds!.x, 0);
    expect(overflowBounds!.y).toBeCloseTo(firstBounds!.y, 0);
    expect(overflowBounds!.height).toBeCloseTo(firstBounds!.height, 0);
    await expect(tracks.locator('span')).toHaveCSS('z-index', '10');
    await expect(details.getByText('125% used')).toBeVisible();
    await expect(details.getByText('RM 25.00 over')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await details.screenshot({ path: testInfo.outputPath('budget-overflow.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const fill of [firstFill, overflowFill]) {
        await expect(fill).toHaveCSS('animation-name', 'none');
        await expect(fill).toHaveCSS('transform', 'none');
    }
});

for (const usage of [75, 100, 100.5, 196.4, 200, 350]) {
    test(`one progress track at ${usage}% in cards and details`, async ({ page }, testInfo) => {
        await references(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 700 });
        const budget = budgetFixture();
        budget.current_cycle!.metrics = calculateBudgetMetrics('100.00', usage.toFixed(2), '0.00', '2026-09-14', '2026-09-21', '2026-09-15');
        budget.status = budget.current_cycle!.metrics.status;
        await page.addInitScript((detail) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = {
            list: { data: [detail.budget], page: 1, page_size: 20, total: 1 }, detail,
        }; }, budgetDetailFixture(budget));
        await page.goto('/finance/budgets');
        const meters = page.getByRole('meter');
        await expect(meters).toHaveCount(2);
        for (const meter of await meters.all()) {
            await expect(meter).toHaveAttribute('aria-valuenow', String(usage));
            const track = meter.locator(':scope > div');
            await expect(track).toHaveCount(1);
            const fills = track.locator(':scope > div');
            await expect(fills).toHaveCount(usage > 100 ? 2 : 1);
            await expect(fills.first()).toHaveAttribute('style', `width: ${Math.min(usage, 100)}%;`);
            if (usage > 100) {
                const overlay = fills.nth(1);
                await expect(overlay).toHaveAttribute('style', `width: ${Math.min(Number((usage - 100).toFixed(6)), 100)}%;`);
                await expect(overlay).toHaveCSS('filter', 'brightness(0.75)');
                const bounds = await track.boundingBox();
                const over = await overlay.boundingBox();
                expect(over!.x).toBeCloseTo(bounds!.x, 0);
                expect(over!.y).toBeCloseTo(bounds!.y, 0);
                expect(over!.height).toBeCloseTo(bounds!.height, 0);
                expect(over!.width).toBeCloseTo(bounds!.width * Math.min(usage - 100, 100) / 100, 0);
            }
        }
        await expect(page.getByRole('region', { name: 'Everyday spending details' }).getByText(`${usage}% used`)).toBeVisible();
        if (usage === 196.4) await page.getByRole('region', { name: 'Everyday spending details' }).screenshot({ path: testInfo.outputPath('budget-overlap-196.png') });
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
}

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
    if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 563 });
    await references(page);
    let budget: FinanceBudgetSummary | null = null;
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/finance/budgets**', async (route) => {
        const request = route.request();
        if (request.method() !== 'GET') {
            const body = request.postDataJSON(); bodies.push(body);
            if (body.action === 'archive') budget = budgetFixture({ name: 'Everyday spending', state: 'archived', status: 'archived', current_cycle: null, revision: 3 });
            else budget = budgetFixture({ name: body.configuration.name, revision: body.action === 'restore' ? 4 : budget ? 2 : 1,
                configuration: { ...budgetFixture().configuration, ...body.configuration } });
            await route.fulfill({ json: { data: budget } }); return;
        }
        const url = new URL(request.url());
        if (url.pathname === '/api/finance/budgets') {
            const data = budget && (url.searchParams.get('state') === 'all' || url.searchParams.get('state') === budget.state) ? [budget] : [];
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
    await page.getByRole('button', { name: 'View Everyday spending' }).click();
    await expect(page.getByRole('region', { name: 'Everyday spending details' })).toBeVisible();
    const transactionsToggle = page.getByRole('region', { name: 'Everyday spending details' }).locator('summary');
    await expect(transactionsToggle).toHaveCSS('padding-left', '12px');
    await expect(transactionsToggle).toHaveCSS('padding-right', '12px');
    await transactionsToggle.hover();
    await expect(transactionsToggle).toHaveCSS('padding-left', '12px');
    await expect(transactionsToggle).toHaveCSS('padding-right', '12px');
    await transactionsToggle.screenshot({ path: testInfo.outputPath('transactions-hover.png') });
    await expect(page.getByText('No matching transactions this cycle.')).not.toBeVisible();
    await transactionsToggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('No matching transactions this cycle.')).toBeVisible();
    await transactionsToggle.click();
    await expect(page.getByText('No matching transactions this cycle.')).not.toBeVisible();
    expect(bodies[0]).toMatchObject({ request_id: expect.any(String), configuration: { amount: '100.00', cycle_type: 'weekly', source_ids: [sourceId], include_uncategorised: true, filter_logic: 'or' } });
    await expect(page.getByRole('table', { name: 'Budget configuration' }).getByRole('rowheader')).toHaveText(['Schedule', 'Filters']);
    const details = page.getByRole('region', { name: 'Everyday spending details' });
    await expect(details.getByText('14 to 20 Sept 2026')).toBeVisible();
    await expect(details.getByText('Budget RM 100.00')).toHaveCount(0);
    for (const status of await page.getByText('Needs attention', { exact: true }).all()) {
        await expect(status).toHaveClass('sr-only');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await details.screenshot({ path: testInfo.outputPath('budget-details.png') });
    await expect(page.getByText(/of cycle days elapsed/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Budget actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Budget amount (MYR)').fill('200');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(bodies[1]).toMatchObject({ revision: 1, configuration: { amount: '200.00' } });
    await page.getByRole('button', { name: 'View Everyday spending' }).click();
    await page.getByRole('button', { name: 'Budget actions' }).click();
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive budget' }).click();
    await page.getByRole('button', { name: 'View Everyday spending' }).click();
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Budget actions' }).click();
    await page.getByRole('menuitem', { name: 'Cycle history' }).click();
    const historyDialog = page.getByRole('dialog', { name: 'Cycle history' });
    await expect(historyDialog.getByText(/net spent/)).toBeVisible();
    await expect(historyDialog.locator('details')).toHaveCount(0);
    await historyDialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Budget actions' })).toBeFocused();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore budget', exact: true }).click();
    await page.getByRole('button', { name: 'View Everyday spending' }).click();
    await expect(page.getByRole('button', { name: 'Budget actions' })).toBeEnabled();
    expect(bodies[3]).toMatchObject({ action: 'restore', revision: 3, configuration: { start_date: '2026-09-14' } });
    await page.screenshot({ path: testInfo.outputPath('budget-lifecycle.png'), fullPage: true });
});

test('budget sections use loaded lists and only fetch selected details', async ({ page }, testInfo) => {
    await references(page);
    const scheduled = budgetFixture({ name: 'Future spending', state: 'scheduled', status: 'scheduled' });
    await page.addInitScript((budget) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = {
        list: { data: [budget], page: 1, page_size: 20, total: 1 }, detail: null,
    }; }, scheduled);
    let releaseDetail!: () => void;
    const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve; });
    const requests: string[] = [];
    await page.route('**/api/finance/budgets**', async (route) => {
        requests.push(new URL(route.request().url()).pathname);
        await detailGate;
        await route.fulfill({ json: { data: budgetDetailFixture(scheduled) } });
    });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Scheduled', exact: true }).click();
    await expect(page.getByRole('button', { name: 'View Future spending' })).toBeVisible();
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    await expect(page.getByText('No archived budgets')).toBeVisible();
    await page.getByRole('button', { name: 'Scheduled', exact: true }).click();
    expect(requests).toEqual([]);
    await page.getByRole('button', { name: 'View Future spending' }).click();
    await expect(page.getByRole('region', { name: 'Loading budget details' })).toBeVisible();
    await expect(page.getByText('Loading budget details...', { exact: true })).toHaveClass('sr-only');
    await page.getByRole('region', { name: 'Loading budget details' }).screenshot({ path: testInfo.outputPath('budget-detail-skeleton.png') });
    await expect(page.getByRole('region', { name: 'Future spending details' })).toHaveCount(0);
    releaseDetail();
    await expect(page.getByRole('region', { name: 'Future spending details' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Loading budget details' })).toHaveCount(0);
    expect(requests).toEqual([`/api/finance/budgets/${scheduled.id}`]);
});
test('budget action keyboard navigation and history pagination', async ({ page }, testInfo) => {
    await references(page);
    const budget = budgetFixture();
    const initial = budgetDetailFixture(budget);
    initial.history = { data: [{ ...budget.current_cycle!, state: 'completed', frozen_at: '2026-09-14T04:00Z' }], page: 1, page_size: 20, total: 21 };
    await page.addInitScript((detail) => { (window as unknown as { budgetInitial: unknown }).budgetInitial = {
        list: { data: [detail.budget], page: 1, page_size: 20, total: 1 }, detail,
    }; }, initial);
    let failedOnce = false;
    await page.route('**/api/finance/budgets**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/finance/budgets') {
            await route.fulfill({ json: { data: [budget], page: 1, page_size: 20, total: 1 } });
        } else if (!failedOnce) {
            failedOnce = true;
            await route.fulfill({ status: 500, json: { error: 'History unavailable. Retry the page.' } });
        } else await route.fulfill({ json: { data: { ...initial, history: { ...initial.history, page: 2 } } } });
    });
    await page.goto('/finance/budgets');
    const actions = page.getByRole('button', { name: 'Budget actions' });
    await actions.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(actions).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await actions.click();
    await page.getByRole('heading', { name: 'Budgets', exact: true }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await actions.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Cycle history' })).toBeFocused();
    await page.keyboard.press('Enter');
    const history = page.getByRole('dialog', { name: 'Cycle history' });
    await expect(history).toBeVisible();
    await history.getByRole('button', { name: 'Next history page' }).click();
    await expect(history.getByRole('alert')).toContainText('History unavailable');
    await history.getByRole('button', { name: 'Next history page' }).click();
    await expect(history.getByText('Page 2 of 2')).toBeVisible();
    await expect(history.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('budget-history-dialog.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(history).toHaveCount(0);
    await expect(actions).toBeFocused();
});

test('missing references require an explicit repair and conflicts retain input', async ({ page }) => {
    await references(page);
    const budget = budgetFixture({ state: 'archived', status: 'archived', current_cycle: null });
    budget.configuration.sources = [{ id: null, original_id: sourceId, name: 'Deleted bank', is_archived: false }];
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
