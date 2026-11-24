import { expect, test } from '@playwright/test';
import { budgetDetailFixture, budgetFixture } from '../fixtures/finance-budgets';
import type { FinanceBudgetConfiguration } from '../../lib/types';

const travel = { id: 'b0250000-0000-4000-8000-000000000021', name: 'Travel', is_archived: false };
const work = { id: 'b0250000-0000-4000-8000-000000000022', name: 'Work', is_archived: false };

test('saves, reloads and clears exclusions separately from grouped filters', async ({ page }, info) => {
    await page.clock.install({ time: new Date('2026-09-14T04:00:00Z') });
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 900 });
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: { sources: [], categories: [], tags: [travel, work] } } }));
    let saved: FinanceBudgetConfiguration | undefined;
    const budget = () => budgetFixture({ name: 'Everyday food', configuration: {
        ...budgetFixture().configuration, ...saved,
        tags: saved?.tag_ids?.map(id => ({ ...travel, id, original_id: id })) ?? [],
        excluded_tags: [travel, work].filter(tag => saved?.excluded_tag_ids?.includes(tag.id)).map(tag => ({ ...tag, original_id: tag.id })),
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
    await dialog.getByLabel('Name').fill('Everyday food');
    await dialog.getByLabel('Budget amount (MYR)').fill('1000');
    // Overlapping include and exclude selections remain visible, with exclusions last.
    await dialog.getByRole('button', { name: 'Choose tags', exact: true }).click();
    await dialog.getByRole('button', { name: travel.name, exact: true }).click();
    await page.keyboard.press('Escape');
    const excluded = dialog.getByRole('region', { name: 'Excluded tags filter' });
    await expect(excluded.locator('[data-budget-dimension]')).toHaveCount(0);
    await expect(excluded.getByRole('button', { name: /group/i })).toHaveCount(0);
    await excluded.getByRole('button', { name: 'Choose excluded tags' }).click();
    await page.keyboard.press('t');
    await page.keyboard.press('Enter');
    expect(saved).toBeUndefined();
    await excluded.getByRole('button', { name: work.name, exact: true }).click();
    await excluded.getByRole('button', { name: 'Done', exact: true }).click();
    const rule = 'Tags (Travel) AND NOT Tags (Travel or Work)';
    await expect(dialog.getByRole('status', { name: 'Budget matching rule' })).toHaveText(rule);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await dialog.screenshot({ path: info.outputPath('excluded-tags-editor.png') });
    await dialog.getByRole('button', { name: 'Create budget', exact: true }).click();
    await expect.poll(() => saved?.excluded_tag_ids).toEqual([travel.id, work.id]);
    await page.getByRole('button', { name: 'View Everyday food', exact: true }).click();
    await expect(page.getByRole('cell', { name: rule, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Budget actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await expect(dialog.getByRole('status', { name: 'Budget matching rule' })).toHaveText(rule);
    await excluded.getByRole('button', { name: 'Choose excluded tags' }).click();
    await expect(excluded.getByRole('button', { name: travel.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await excluded.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await excluded.getByRole('button', { name: 'Done', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => saved?.excluded_tag_ids).toEqual([]);
    await page.getByRole('button', { name: 'View Everyday food', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Tags (Travel)', exact: true })).toBeVisible();
});
