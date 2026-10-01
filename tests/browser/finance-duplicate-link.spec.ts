import { expect, test } from '@playwright/test';
import { reviewCandidates } from '../fixtures/finance-review';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
    const candidate = structuredClone(reviewCandidates[0]);
    candidate.payload.reference_number = 'BACKUP123';
    candidate.payload.notes = 'Receipt note';
    candidate.duplicate_transaction!.notes = 'Keep my note';
    await page.addInitScript((candidate) => { (window as unknown as { reviewInitial: unknown }).reviewInitial = [candidate]; }, candidate);
});

test('adds missing values and replaces only explicitly selected conflicts', async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 330, height: 800 });
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/finance/review', async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
    await page.goto('/finance/review');
    await expect(page.getByRole('switch', { name: 'Use incoming reference number', exact: true })).toHaveAttribute('aria-checked', 'true');
    const merchant = page.getByRole('switch', { name: 'Use incoming merchant', exact: true });
    await expect(merchant).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Use incoming notes', exact: true })).toHaveAttribute('aria-checked', 'false');
    await merchant.focus();
    await page.keyboard.press('Space');
    await expect(merchant).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('region', { name: 'Link transaction details' }).screenshot({ path: info.outputPath('link-details.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Link selected details', exact: true }).click();
    await expect.poll(() => body).not.toBeNull();
    expect(body).toMatchObject({ action: 'link_duplicate', matched_transaction_id: 'existing-1', expected_updated_at: '2026-09-21T00:00:00Z', changes: { reference_number: 'BACKUP123', merchant: 'Sample cafe', payee_name: 'Alex' } });
    expect((body!.changes as object)).not.toHaveProperty('notes');
    expect((body!.changes as object)).not.toHaveProperty('transaction_date');
    await expect(page.getByRole('region', { name: 'Link transaction details' })).toHaveCount(0);
});

test('changing a chosen conflict requires choosing the new incoming value again', async ({ page }) => {
    await page.goto('/finance/review');
    const merchant = page.getByRole('switch', { name: 'Use incoming merchant', exact: true });
    await merchant.click();
    await page.locator('#review-merchant').fill('Another corrected merchant');
    await expect(merchant).toHaveAttribute('aria-checked', 'false');
});

test('failed linking keeps the review item available', async ({ page }) => {
    await page.route('**/api/finance/review', (route) => route.fulfill({ status: 409, json: { error: 'Finance data changed concurrently. Retry the action.' } }));
    await page.addInitScript(() => { window.addEventListener('test-router-refresh', () => { document.documentElement.dataset.refreshRequested = 'true'; }); });
    await page.goto('/finance/review');
    await page.getByRole('button', { name: 'Link selected details', exact: true }).click();
    await expect(page.getByText('Finance data changed concurrently. Retry the action.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-refresh-requested', 'true');
    await expect(page.getByRole('region', { name: 'Link transaction details' })).toBeVisible();
});
