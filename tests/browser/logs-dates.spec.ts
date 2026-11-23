import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('daily logs create, edit and export with day-first dates and ISO request values', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-23T04:00:00Z'));
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: { sources: [], categories: [], tags: [] } } }));
    await page.route('**/api/projects', route => route.fulfill({ json: { data: [] } }));
    await page.route('**/api/logs', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { data: [], next_cursor: null } });
        const { content } = route.request().postDataJSON();
        await route.fulfill({ json: { data: { id: 'synthetic-log', source: 'human', effective_date: content.date, content } } });
    });
    await page.route('**/api/logs/synthetic-log', async route => {
        const { content } = route.request().postDataJSON();
        await route.fulfill({ json: { data: { id: 'synthetic-log', source: 'human', effective_date: content.date, content } } });
    });
    await page.route('**/api/export/weekly', route => route.fulfill({ json: { markdown: '# Synthetic logs' } }));
    await page.goto('/logs');
    await page.getByRole('button', { name: 'New Entry', exact: true }).click();
    const date = page.getByRole('button', { name: /^Date,/ });
    await expect(date).toHaveText('23 Nov 2026');
    await date.click();
    await page.getByRole('button', { name: 'Saturday, 21 November 2026', exact: true }).click();
    const created = page.waitForRequest(request => request.url().endsWith('/api/logs') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    expect((await created).postDataJSON().content.date).toBe('2026-11-21');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(date).toHaveText('21 Nov 2026');
    await date.click();
    await page.getByRole('button', { name: 'Sunday, 22 November 2026', exact: true }).click();
    const edited = page.waitForRequest(request => request.method() === 'PATCH');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await edited).postDataJSON().content.date).toBe('2026-11-22');

    const from = page.getByRole('button', { name: /^From date,/ });
    const to = page.getByRole('button', { name: /^To date,/ });
    await from.click();
    await page.getByRole('button', { name: 'Saturday, 21 November 2026', exact: true }).click();
    await expect(from).toHaveText('21 Nov 2026');
    await to.click();
    await page.getByRole('button', { name: 'Sunday, 22 November 2026', exact: true }).click();
    await expect(to).toHaveText('22 Nov 2026');
    const exported = page.waitForRequest(request => request.url().endsWith('/api/export/weekly'));
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    expect((await exported).postDataJSON()).toEqual({ from: '2026-11-21', to: '2026-11-22' });
    await page.getByRole('button', { name: /^Dismiss$|^Close/ }).first().click();
    await from.click();
    await page.getByRole('button', { name: 'Clear From date', exact: true }).click();
    await expect(from).toHaveText('From date');
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
});
