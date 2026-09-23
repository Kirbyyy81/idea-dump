import { expect, test } from '@playwright/test';
import type { FinanceShareBatch } from '../../lib/types';

const batch: FinanceShareBatch = {
    id: 'batch', status: 'PROCESSING', total_files: 4, queued_files: 3, processing_files: 1,
    completed_files: 0, review_files: 0, duplicate_files: 0, failed_files: 0,
    items: Array.from({ length: 4 }, (_, index) => ({ id: String(index),
        original_filename: `Screenshot_20260921_1508${index}_very_long_receipt_filename.png`,
        status: index === 0 ? 'PROCESSING' : 'QUEUED' })),
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
});

for (const status of ['QUEUED', 'PROCESSING', 'CLEANING_UP'] as const) {
    test(`batch ${status} keeps entry hidden and progress compact`, async ({ page }, testInfo) => {
        await page.route('**/api/finance/share-batches/active', (route) => route.fulfill({ json: { data: { ...batch, status } } }));
        await page.goto('/finance/add');
        await expect(page.getByRole('heading', { name: status === 'CLEANING_UP' ? 'Finishing up' : 'Processing images' })).toBeVisible();
        await expect(page.getByRole('group', { name: 'Transaction entry method' })).toHaveCount(0);
        await expect(page.getByText('Transaction screenshot', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Ready - you may close the app')).toHaveCount(0);
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        await expect(page.getByText('0 of 4 finished')).toBeVisible();
        await expect(page.getByText('Added', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('listitem')).toHaveCount(4);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`batch-${status.toLowerCase()}.png`), fullPage: true });
    });
}

test('polling failure preserves the batch; successful empty status restores entry', async ({ page }) => {
    await page.clock.install();
    let outcome: 'active' | 'error' | 'empty' = 'active';
    await page.route('**/api/finance/share-batches/active', (route) => outcome === 'error'
        ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
        : route.fulfill({ json: { data: outcome === 'active' ? batch : null } }));
    await page.goto('/finance/add');
    await expect(page.getByRole('heading', { name: 'Processing images' })).toBeVisible();
    outcome = 'error';
    await page.clock.runFor(3_100);
    await expect(page.getByRole('alert')).toContainText('Unable to refresh processing status.');
    await expect(page.getByRole('group', { name: 'Transaction entry method' })).toHaveCount(0);
    outcome = 'empty';
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Transaction entry method' })).toBeVisible();
    await expect(page.getByText('Transaction screenshot', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Processing images' })).toHaveCount(0);
    await expect(page.getByText('Batch complete')).toHaveCount(0);
});
