import { expect, test } from '@playwright/test';
import { tagTransactions } from './finance-tags-fixture';

// US browser settings must not change the app's day-first date display.
test.use({ locale: 'en-US' });

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: {
        data: { sources: [{ id: tagTransactions[0].source_id, name: 'Bank' }], categories: [], tags: [] },
    } }));
    await page.route('**/api/finance/share-batches/active', route => route.fulfill({ json: { data: null } }));
});

for (const flow of ['Add', 'Edit', 'Review'] as const) {
    test(`${flow} displays day-first dates and supports keyboard date selection`, async ({ page }) => {
        const url = flow === 'Add' ? '/finance/add' : flow === 'Edit'
            ? `/finance/transactions/edit?id=${tagTransactions[0].id}` : '/finance/review';
        await page.goto(url);
        if (flow === 'Add') await page.getByRole('button', { name: 'Manual', exact: true }).click();
        const date = page.getByRole('button', { name: /^Date,/ });
        await expect(date).toHaveText(flow === 'Add' ? '22 Sept 2026' : '21 Sept 2026');
        await expect(page.locator('input[type="date"]')).toHaveCount(0);
        await date.focus();
        await page.keyboard.press('Enter');
        const calendar = page.getByRole('dialog', { name: /^Choose date/ });
        await expect(calendar).toBeVisible();
        await expect(calendar.getByRole('button', { name: 'Previous month' })).toBeFocused();
        await expect(calendar.getByRole('button', { name: 'Wednesday, 23 September 2026', exact: true })).toBeDisabled();
        await calendar.getByRole('button', { name: 'Sunday, 20 September 2026', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(date).toHaveText('20 Sept 2026');
        await expect(date).toBeFocused();
        await expect(calendar).toHaveCount(0);

        if (flow === 'Edit') {
            let savedDate: unknown;
            await page.route('**/api/finance/transactions', async route => {
                savedDate = route.request().postDataJSON().transaction_date;
                await route.fulfill({ json: { data: tagTransactions[0] } });
            });
            await page.getByRole('button', { name: 'Save changes', exact: true }).click();
            await expect.poll(() => savedDate).toBe('2026-09-20');
        }
    });
}
