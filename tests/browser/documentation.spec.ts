import { expect, test } from '@playwright/test';

test('library search and reader find work across desktop and mobile', async ({ page }) => {
    await page.goto('/documentation');
    await expect(page.getByRole('link', { name: /Hybrid Technical Documentation/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search document contents' }).fill('eligibility');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('Searched 1 of 1 documents')).toBeVisible();
    await expect(page.getByText('2 matches')).toBeVisible();
    await page.getByRole('link', { name: /Hybrid Technical Documentation/ }).click();
    await expect(page.getByRole('heading', { name: 'Hybrid Technical Documentation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Diagram' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Versions', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '1 of 2' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Find in this document' }).fill('Searchable value');
    await expect(page.getByRole('status').filter({ hasText: '1 of 1' })).toBeVisible();
    await expect(page.locator('mark.documentation-match-active')).toHaveText('Searchable value');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 700) {
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(viewport.width + 2);
    }
});
