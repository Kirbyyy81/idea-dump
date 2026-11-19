import { expect, test } from '@playwright/test';
import { budgetDetailFixture, budgetFixture } from '../fixtures/finance-budgets';
import type { FinanceBudgetConfiguration } from '../../lib/types';

const source = { id: 'b0250000-0000-4000-8000-000000000011', name: 'Ryt Bank' };
const category = { id: 'b0250000-0000-4000-8000-000000000021', name: 'Food' };
const tag = { id: 'b0250000-0000-4000-8000-000000000041', name: 'Travel - Taiwan 2026', is_archived: false };

test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-14T04:00:00Z') });
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: {
        sources: [source], categories: [category], tags: [tag],
    } } }));
});

test('groups cards with the keyboard, previews mixed matching and restores the saved rule', async ({ page }, info) => {
    let saved: FinanceBudgetConfiguration | undefined;
    const budget = () => budgetFixture({ name: 'Trip food', configuration: { ...budgetFixture().configuration, ...saved,
        sources: [{ ...source, original_id: source.id, is_archived: false }],
        categories: [{ ...category, original_id: category.id, is_archived: false }], tags: [{ ...tag, original_id: tag.id }],
    } });
    await page.route('**/api/finance/budgets**', async route => {
        const request = route.request();
        if (request.method() === 'POST' || request.method() === 'PUT') {
            saved = request.postDataJSON().configuration;
            await route.fulfill({ json: { data: budget() } });
        } else if (new URL(request.url()).pathname === '/api/finance/budgets') {
            await route.fulfill({ json: { data: saved ? [budget()] : [], total: saved ? 1 : 0, page: 1, page_size: 20 } });
        } else await route.fulfill({ json: { data: budgetDetailFixture(budget()) } });
    });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Create budget', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Trip food');
    await dialog.getByLabel('Budget amount (MYR)').fill('1000');
    await dialog.getByRole('switch', { name: source.name, exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Search categories', exact: true }).fill('food');
    await dialog.getByRole('switch', { name: category.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Choose tags', exact: true }).click();
    await dialog.getByRole('button', { name: tag.name, exact: true }).click();
    await page.keyboard.press('Escape');
    const menu = dialog.getByRole('button', { name: 'Categories grouping', exact: true });
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Group with Sources', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Group with Tags', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    const group = dialog.getByRole('group', { name: 'Grouped filters', exact: true });
    await expect(group.getByRole('region', { name: 'Categories filter' })).toBeVisible();
    await expect(group.getByRole('region', { name: 'Tags filter' })).toBeVisible();
    await group.getByRole('combobox', { name: 'Match grouped filters' }).click();
    await page.getByRole('option', { name: 'Match any (OR)', exact: true }).click();
    const expected = '(Sources (Ryt Bank) AND (Categories (Food) OR Tags (Travel - Taiwan 2026)))';
    await expect(dialog.getByRole('status', { name: 'Budget matching rule' })).toHaveText(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await dialog.screenshot({ path: info.outputPath('grouped-budget-editor.png') });
    await dialog.getByRole('button', { name: 'Create budget', exact: true }).click();
    await expect.poll(() => saved).toMatchObject({ source_ids: [source.id], category_ids: [category.id], tag_ids: [tag.id],
        filter_logic: 'and', filter_group: { dimensions: ['category', 'tag'], logic: 'or' } });
    await page.getByRole('button', { name: 'View Trip food', exact: true }).click();
    await expect(page.getByRole('cell', { name: expected, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Budget actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await expect(dialog.getByRole('status', { name: 'Budget matching rule' })).toHaveText(expected);
    await expect(dialog.getByRole('combobox', { name: 'Match grouped filters' })).toHaveText('Match any (OR)');
    await dialog.getByRole('button', { name: 'Ungroup', exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Grouped filters', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => saved?.filter_group).toBeNull();
});

test('drags cards to group using a pointer or touch and preserves selections when ungrouping', async ({ page, isMobile }) => {
    await page.setViewportSize({ width: isMobile ? 390 : 1280, height: 1100 });
    await page.goto('/finance/budgets');
    await page.getByRole('button', { name: 'Create budget', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('switch', { name: source.name, exact: true }).click();
    const handle = dialog.getByRole('button', { name: 'Drag Sources to group' });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await dialog.getByRole('heading', { name: 'Categories', exact: true }).boundingBox();
    if (!from || !to) throw new Error('Budget drag targets missing');
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    if (isMobile) {
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
            x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8,
        }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
    } else {
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    }
    const group = dialog.getByRole('group', { name: 'Grouped filters', exact: true });
    await expect(group.getByRole('region', { name: 'Sources filter' })).toBeVisible();
    await expect(group.getByRole('region', { name: 'Categories filter' })).toBeVisible();
    await expect(group.getByRole('switch', { name: source.name })).toBeChecked();
    await dialog.getByRole('button', { name: 'Ungroup', exact: true }).click();
    await expect(group).toHaveCount(0);
    await expect(dialog.getByRole('switch', { name: source.name })).toBeChecked();
    await expect(dialog.locator('[data-budget-dimension]')).toHaveCount(3);
});
