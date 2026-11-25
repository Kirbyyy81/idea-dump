import { expect, test } from '@playwright/test';

const sources = [
    { id: '52000000-0000-4000-8000-000000000001', name: 'Ryt Bank' },
    { id: '52000000-0000-4000-8000-000000000002', name: 'TnG' },
];

const longFormat = 'PaymentReference'.repeat(24);

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: { sources, categories: [] } } }));
    await page.route('**/api/finance/category-memories', route => route.fulfill({ json: { data: [] } }));
    await page.route(url => url.pathname === '/api/finance/notification-patterns', route => {
        const source = new URL(route.request().url()).searchParams.get('source_id');
        return route.fulfill({ json: { data: Array.from({ length: 12 }, (_, index) => ({
            id: `${source}-${index}`,
            name: `Pattern ${index + 1}`,
            definition: { version: 1, parts: [longFormat, { kind: 'amount', field: 'amount' }] },
            origin: 'starter',
            is_active: true,
            evidence_valid: true,
            revision: 1,
        })) } });
    });
});

test('starts collapsed and supports keyboard navigation through one section at a time', async ({ page }) => {
    await page.route('**/api/finance/rules', route => route.fulfill({ json: { data: [], learning: { availability: 'never_run' } } }));
    await page.goto('/finance/settings?section=rules');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['New rule', 'Notification patterns', 'Learned categories', 'Learning']);
    const newRule = page.getByRole('button', { name: 'New rule', exact: true });
    const notifications = page.getByRole('button', { name: 'Notification patterns', exact: true });
    const learned = page.getByRole('button', { name: 'Learned categories', exact: true });
    const learning = page.getByRole('button', { name: 'Learning', exact: true });
    for (const section of [newRule, notifications, learned, learning]) {
        await expect(section).toHaveAttribute('aria-expanded', 'false');
        const panelId = await section.getAttribute('aria-controls');
        await expect(page.locator(`[id="${panelId}"]`)).toBeHidden();
    }
    await expect(page.getByRole('textbox', { name: 'Rule name' })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(newRule).toBeFocused();
    await expect(newRule).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Tab');
    await expect(notifications).toBeFocused();
    await page.keyboard.press('Space');
    await expect(notifications).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Notification patterns', exact: true })).toBeVisible();
    const source = page.getByRole('combobox', { name: 'Notification source' });
    await expect(source).toBeEnabled();
    await page.keyboard.press('Tab');
    await expect(source).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(notifications).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(notifications).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Tab');
    await expect(learned).toBeFocused();
});

test('keeps selections and the rule draft when switching sections, then saves the draft', async ({ page }) => {
    await page.route('**/api/finance/rules', async route => {
        if (route.request().method() === 'POST') {
            expect(route.request().postDataJSON()).toMatchObject({ name: 'Toll payments', pattern: 'PayDirect Toll' });
            return route.fulfill({ json: { data: { id: 'new-rule' } } });
        }
        return route.fulfill({ json: { data: [], learning: { availability: 'never_run' } } });
    });
    await page.goto('/finance/settings?section=rules');
    const newRule = page.getByRole('button', { name: 'New rule', exact: true });
    const notifications = page.getByRole('button', { name: 'Notification patterns', exact: true });
    const learned = page.getByRole('button', { name: 'Learned categories', exact: true });
    await newRule.click();
    const ruleName = page.getByRole('textbox', { name: /^Rule name/ });
    const matchText = page.getByRole('textbox', { name: /^Text to match/ });
    await ruleName.fill('Toll payments');
    await matchText.fill('PayDirect Toll');
    await notifications.click();
    await expect(newRule).toHaveAttribute('aria-expanded', 'false');
    const source = page.getByRole('combobox', { name: 'Notification source', exact: true });
    await source.click();
    await page.getByRole('option', { name: 'TnG', exact: true }).click();
    await expect(source).toContainText('TnG');
    await expect(page.getByRole('button', { name: 'Edit Pattern 12', exact: true })).toBeVisible();
    const format = page.getByText(`${longFormat}[amount]`, { exact: true }).filter({ visible: true }).first();
    await expect(format).toBeVisible();
    expect(await format.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await learned.click();
    await expect(notifications).toHaveAttribute('aria-expanded', 'false');
    await expect(learned).toBeFocused();
    await expect(learned).toBeInViewport({ ratio: 1 });
    await notifications.click();
    await expect(source).toContainText('TnG');
    await newRule.click();
    await expect(ruleName).toHaveValue('Toll payments');
    await expect(matchText).toHaveValue('PayDirect Toll');
    await page.getByRole('button', { name: 'Add rule', exact: true }).click();
    await expect(page.getByText('Rule added', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ruleName).toHaveValue('');
    await expect(learned).toHaveAttribute('aria-expanded', 'false');
});
