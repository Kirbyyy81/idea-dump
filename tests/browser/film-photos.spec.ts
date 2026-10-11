import { expect, test, type Page } from '@playwright/test';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE/8AAAAASUVORK5CYII=', 'base64');

async function setupPhotos(page: Page, missingThumbnail = false) {
    const reads = { rolls: 0, cameras: 0, thumbnails: 0, originals: 0, updates: 0 };
    const photos = [
        { id: 'photo-a', name: '01.JPG', mime_type: 'image/jpeg', web_view_link: 'https://drive.google.com/file/d/a/view', width: 6000, height: 4000, is_favorite: false },
        { id: 'photo-b', name: '02.JPG', mime_type: 'image/jpeg', web_view_link: null, width: null, height: null, is_favorite: false },
    ];
    const roll = { id: 'roll-a', film_name: 'Fujifilm 200', brand: 'Fuji', format: '35mm', film_type: 'NEGATIVE', process_type: 'C41', iso: 200, status: 'PROCESSED', camera_id: null, frames_taken: 36, successful_photos: 30, purchase_price: 30, processing_cost: 15, scanning_cost: 10, shipping_cost: 0, cover_photo_id: null as string | null, cover_image_url: null, photos };
    let failUpdate = false;
    await page.route('**/api/film/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.endsWith('/image')) {
            if (url.searchParams.has('size')) {
                reads.thumbnails++;
                expect(url.searchParams.get('size')).toBe('thumbnail');
                if (missingThumbnail) return route.fulfill({ status: 404, json: { error: 'Photo preview is unavailable' } });
            } else reads.originals++;
            return route.fulfill({ contentType: 'image/png', body: pixel });
        }
        if (url.pathname === '/api/film/cameras') {
            reads.cameras++;
            return route.fulfill({ json: { data: [] } });
        }
        if (url.pathname === '/api/film/photos') {
            reads.updates++;
            expect(request.method()).toBe('PUT');
            if (failUpdate) return route.fulfill({ status: 500, json: { error: 'Could not save photo' } });
            const change = request.postDataJSON();
            const photo = photos.find((item) => item.id === change.id)!;
            if (change.is_favorite !== undefined) photo.is_favorite = change.is_favorite;
            if (change.set_as_cover) roll.cover_photo_id = photo.id;
            return route.fulfill({ json: { data: photo } });
        }
        reads.rolls++;
        return route.fulfill({ json: { data: roll } });
    });
    await page.goto('/film/rolls/roll-a?step=photobook');
    return { reads, failUpdates: () => { failUpdate = true; } };
}

test('loads thumbnails for the gallery and the original only when a photo opens', async ({ page }) => {
    const { reads } = await setupPhotos(page);
    const preview = page.getByRole('button', { name: '01.JPG', exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator('img')).toHaveAttribute('src', '/api/film/photos/photo-a/image?size=thumbnail');
    await expect(preview.locator('img')).toHaveAttribute('loading', 'lazy');
    await expect.poll(() => reads.thumbnails).toBe(2);
    expect(reads.originals).toBe(0);
    await expect(page.getByText('Contact Sheet', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Manage Drive', { exact: true })).toHaveCount(0);
    await preview.click();
    await expect(page.getByRole('heading', { name: '01.JPG' })).toBeVisible();
    await expect(page.locator('img[src="/api/film/photos/photo-a/image"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in Drive' })).toBeVisible();
    await expect.poll(() => reads.originals).toBe(1);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(preview).toBeVisible();
    expect(reads.rolls).toBe(1);
    expect(reads.cameras).toBe(1);
});

test('shows a usable placeholder when a thumbnail is unavailable without downloading originals', async ({ page }) => {
    const { reads } = await setupPhotos(page, true);
    const placeholder = page.getByRole('img', { name: '01.JPG, preview unavailable' });
    await expect(placeholder).toBeVisible();
    expect(reads.originals).toBe(0);
    await placeholder.click();
    await expect(page.locator('img[src="/api/film/photos/photo-a/image"]')).toBeVisible();
    expect(reads.originals).toBe(1);
});
