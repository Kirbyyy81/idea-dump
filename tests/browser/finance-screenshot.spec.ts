import { expect, test } from '@playwright/test';

test('large uncropped preview and one popup through reading, error, retry and review', async ({ page }, testInfo) => {
    await page.route('**/api/finance/reference-data', (route) => route.fulfill({ json: { data: { sources: [], categories: [] } } }));
    await page.route('**/api/finance/share-batches/active', (route) => route.fulfill({ json: { data: null } }));
    let finish!: () => void;
    let attempt = 0;
    let requests = 0;
    await page.route('**/test-ocr', async (route) => {
        requests++;
        await new Promise<void>((resolve) => { finish = resolve; });
        attempt++;
        await route.fulfill(attempt === 1 ? { status: 503 } : { json: {
            data: { candidate: { id: 'candidate-1' }, auto_confirmed: false, transaction: null },
        } });
    });
    await page.goto('/finance/add');
    await expect(page.getByRole('button', { name: 'Process screenshot' })).toBeVisible();
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 800;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 800);
        ctx.fillStyle = '#191917'; ctx.font = '24px sans-serif';
        ctx.fillText('Receipt top', 20, 40); ctx.fillText('Receipt bottom', 20, 770);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    const preview = page.getByRole('img', { name: 'Transaction screenshot preview' });
    await expect(preview).toHaveCSS('object-fit', 'contain');
    const box = await preview.boundingBox();
    expect(box!.height).toBeGreaterThan(250);
    expect(box!.width).toBeGreaterThan(280);
    await page.screenshot({ path: testInfo.outputPath('large-preview.png'), fullPage: true });
    await page.getByRole('button', { name: 'Process screenshot' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Reading screenshot', { exact: true })).toBeVisible();
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(page.getByText('You may leave the app.')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('processing.png'), fullPage: true });
    finish();
    await expect(dialog.getByRole('alert')).toContainText('Connection interrupted');
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByText('Reading screenshot', { exact: true })).toBeVisible();
    await expect.poll(() => attempt).toBe(1);
    await expect.poll(() => requests).toBe(2);
    finish();
    await expect(dialog.getByText('You may leave the app.')).toBeVisible();
    await expect(page).toHaveURL(/\/finance\/add$/);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('ready-for-review.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/finance\/review\?candidate=candidate-1$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
