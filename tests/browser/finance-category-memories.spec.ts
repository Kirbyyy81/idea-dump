import { expect, test } from '@playwright/test';

const id = '52000000-0000-4000-8000-000000000001';
const category = '52000000-0000-4000-8000-000000000002';

test('resolves conflicting categories, pauses learning and forgets with confirmation', async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 800 });
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: {
        sources: [], categories: [{ id: category, name: 'Food' }],
    } } }));
    let rows = [{ id, party_kind: 'payee', party_name: 'Alex', direction: 'expense', is_active: true,
        override_category_id: null as string | null, category_id: null as string | null, revision: 1, evidence_count: 2, has_conflict: true }];
    const mutations: Record<string, unknown>[] = [];
    await page.route('**/api/finance/category-memories', async route => {
        if (route.request().method() === 'PATCH') {
            const input = route.request().postDataJSON();
            mutations.push(input);
            rows = input.action === 'forget' ? [] : rows.map(row => ({ ...row,
                override_category_id: input.category_id, category_id: input.category_id,
                is_active: input.is_active ?? row.is_active, has_conflict: input.category_id === null,
            }));
        }
        await route.fulfill({ json: { data: rows } });
    });
    await page.goto('/finance/settings/category-memories');
    await expect(page.getByText('Different categories were chosen.', { exact: false })).toBeVisible();
    await page.getByRole('combobox', { name: 'Category for Alex' }).click();
    await page.getByRole('option', { name: 'Always use Food' }).click();
    await expect(page.getByText('Different categories were chosen.', { exact: false })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Category for Alex' }).click();
    await page.getByRole('option', { name: 'Use learned choices', exact: true }).click();
    await expect(page.getByText('Different categories were chosen.', { exact: false })).toBeVisible();
    await page.getByRole('combobox', { name: 'Category for Alex' }).click();
    await page.getByRole('option', { name: 'Always use Food' }).click();
    const toggle = page.getByRole('switch', { name: 'Enable category learning for Alex' });
    await expect(toggle).toBeEnabled();
    await toggle.focus(); await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mutations.at(-1)).toMatchObject({ id, category_id: category, is_active: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('learned-categories.png'), fullPage: true });
    await page.getByRole('button', { name: 'Forget', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('Category corrections in Review and Transactions will appear here.')).toBeVisible();
});
