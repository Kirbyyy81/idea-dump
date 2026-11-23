import { expect, test } from '@playwright/test';
import { tagTransactions } from './finance-tags-fixture';

const first = { kind: 'transaction', id: tagTransactions[0].id, version: '2026-11-19T04:00:00+00:00', amount: 100, currency: 'MYR', direction: 'expense', party_name: 'My TNG', transaction_date: '2026-11-19', transfer_id: null };
const second = { ...first, kind: 'candidate', id: 'candidate-2', direction: 'income', party_name: 'My Ryt', source_name: 'TNG' };
test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: { data: { sources: [], categories: [], tags: [] } } }));
});

test('previews both entries and explicitly saves a reusable transfer rule', async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 800 });
    let body: Record<string, unknown> | undefined;
    await page.route('**/api/finance/transfers?*', route => route.fulfill({ json: { data: { entry: first, options: [second] } } }));
    await page.route('**/api/finance/transfers', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: { data: { resolved_candidate_ids: ['candidate-1', 'candidate-2'] } } }); });
    await page.goto('/finance/transactions/edit?id=' + first.id);
    const actions = page.getByRole('button', { name: 'Save changes' }).locator('..');
    await expect(actions.getByRole('button', { name: 'Link as internal transfer' })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Cancel', exact: true })).toBeVisible();
    const notesBounds = await page.locator('#edit-notes').boundingBox();
    const actionBounds = await actions.boundingBox();
    expect(actionBounds!.y).toBeGreaterThan(notesBounds!.y + notesBounds!.height);
    await page.getByRole('button', { name: 'Link as internal transfer' }).click();
    const region = page.getByRole('region', { name: 'Internal transfer', exact: true });
    await expect(region.getByText(/This entry: Outgoing RM\s*100\.00/)).toBeVisible();
    await expect(region.getByRole('button', { name: 'Link both entries' })).toBeDisabled();
    await region.getByRole('combobox', { name: 'Other account entry' }).click();
    await page.getByRole('option', { name: /TNG · Incoming RM\s*100\.00/ }).click();
    const rule = region.getByRole('switch', { name: 'Save rule for future transfers' });
    await expect(rule).toHaveAttribute('aria-checked', 'false');
    await expect(region.getByRole('combobox', { name: 'Other account entry' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(rule).toBeFocused(); await page.keyboard.press('Space');
    await expect(rule).toHaveAttribute('aria-checked', 'true');
    await expect(region.getByText(/within 10 minutes/)).toBeVisible();
    await expect(region.getByText(/Other entry: TNG · Incoming RM\s*100\.00 · My Ryt/)).toBeVisible();
    const bounds = await rule.boundingBox(); const regionBounds = await region.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(regionBounds!.x + regionBounds!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await region.screenshot({ path: info.outputPath('transfer-preview.png') });
    await region.getByRole('button', { name: 'Link both entries' }).click();
    await expect.poll(() => body).toMatchObject({ first, second, save_rule: true });
    await expect(page.getByRole('button', { name: 'Link both entries' })).toHaveCount(0);
});

test('keeps the pair available after a stale version conflict', async ({ page }) => {
    await page.route('**/api/finance/transfers?*', route => route.fulfill({ json: { data: { entry: first, options: [second] } } }));
    await page.route('**/api/finance/transfers', route => route.fulfill({ status: 409, json: { error: 'Transaction details changed. Reload and select the pair again.' } }));
    await page.goto('/finance/transactions/edit?id=' + first.id);
    await page.getByRole('button', { name: 'Link as internal transfer' }).click();
    await page.getByRole('combobox', { name: 'Other account entry' }).click();
    await page.getByRole('option', { name: /TNG · Incoming/ }).click();
    await page.getByRole('button', { name: 'Link both entries' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Transaction details changed.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link both entries' })).toBeEnabled();
});

test('requires both entries and prevents dropping unsaved transaction edits', async ({ page }) => {
    await page.route('**/api/finance/transfers?*', route => route.fulfill({ json: { data: { entry: first, options: [] } } }));
    await page.goto('/finance/transactions/edit?id=' + first.id);
    await page.getByRole('button', { name: 'Link as internal transfer' }).click();
    await expect(page.getByText(/Both entries are required/)).toBeVisible();
    await page.locator('#edit-notes').fill('Keep these edited details');
    await expect(page.getByRole('button', { name: 'Reload matching entries' })).toBeDisabled();
    await expect(page.getByText('Save your changes before linking a transfer.')).toBeVisible();
});

test('does not offer internal transfer linking in Review', async ({ page }) => {
    await page.goto('/finance/review');
    await expect(page.getByRole('heading', { name: 'Candidate details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link as internal transfer' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Internal transfer', exact: true })).toHaveCount(0);
});

test('shows neutral transfer rows and protects the linked financial fields', async ({ page }) => {
    const transaction = { ...tagTransactions[0], transfer_id: 'transfer-1', transfer: { id: 'transfer-1', created_at: first.version,
        outgoing_transaction_id: tagTransactions[0].id, incoming_transaction_id: 'other-entry',
        outgoing_source: { id: 'ryt', name: 'Ryt' }, incoming_source: { id: 'tng', name: 'TNG' } } };
    await page.addInitScript(transaction => { (window as unknown as { transactionInitial: unknown }).transactionInitial = [transaction]; }, transaction);
    await page.goto('/finance/transactions');
    const row = page.locator('[data-finance-transaction-row="default"]');
    await expect(row.getByText('Internal transfer · Ryt → TNG')).toBeVisible();
    await expect(row).not.toContainText('-RM'); await expect(row).not.toContainText('+RM');
    await page.goto('/finance/transactions/edit?id=' + transaction.id);
    await expect(page.locator('#edit-amount')).toBeDisabled();
    await expect(page.locator('#edit-source')).toBeDisabled();
    await expect(page.locator('#edit-notes')).toBeEnabled();
    await expect(page.getByRole('link', { name: 'View other entry' })).toHaveAttribute('href', '/finance/transactions/edit?id=other-entry');
    let deleted: unknown;
    await page.route('**/api/finance/transfers', async route => { deleted = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
    await page.getByRole('button', { name: 'Unlink transfer' }).click();
    await expect.poll(() => deleted).toEqual({ id: 'transfer-1', version: first.version });
});

test('disables and deletes saved matching rules', async ({ page }) => {
    let rule = { id: 'rule-1', updated_at: first.version, outgoing_source_name: 'Ryt', incoming_source_name: 'TNG',
        outgoing_party_name: 'My TNG', incoming_party_name: 'My Ryt', is_active: true };
    await page.route('**/api/finance/transfers/rules', async route => {
        if (route.request().method() === 'DELETE') return route.fulfill({ json: { data: [] } });
        if (route.request().method() === 'PUT') rule = { ...rule, is_active: false };
        return route.fulfill({ json: { data: [rule] } });
    });
    await page.goto('/finance/settings?section=transfers');
    await page.getByRole('button', { name: 'Disable rule' }).click();
    await expect(page.getByText('Ryt → TNG (disabled)')).toBeVisible();
    await page.getByRole('button', { name: 'Delete rule' }).click();
    await expect(page.getByText('No saved transfer rules.')).toBeVisible();
});
