import { expect, test, type Page } from '@playwright/test';

const cameraFixture = [
    { id: 'camera-a', name: 'Weekend camera', brand: 'Nikon', model: 'F3', notes: '', purchase_date: '' },
    { id: 'camera-b', name: 'Travel camera', brand: 'Samsung', model: 'AF Slim Zoom', notes: '', purchase_date: '' },
    { id: 'camera-c', name: 'A camera with a very long name for the collection shelf', brand: 'Olympus', model: 'OM-1', notes: '', purchase_date: '' },
];

async function setup(page: Page, empty = false) {
    let cameras = empty ? [] : structuredClone(cameraFixture);
    let maintenance = [{ id: 'service-b', camera_id: 'camera-b', service_type: 'Lens Cleaning', provider_name: 'Travel lab', maintenance_cost: 30, notes: '', service_date: '2026-01-01' }];
    let cameraReads = 0;
    await page.route('**/api/film/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        let data: unknown;
        if (url.pathname === '/api/film/cameras') {
            if (method === 'GET') { cameraReads++; data = cameras; }
            if (method === 'POST') {
                const camera = { ...request.postDataJSON(), id: 'camera-new' };
                cameras.push(camera); data = camera;
            }
            if (method === 'PUT') {
                const camera = request.postDataJSON();
                cameras = cameras.map((item) => item.id === camera.id ? { ...item, ...camera } : item);
                data = cameras.find((item) => item.id === camera.id);
            }
            if (method === 'DELETE') { cameras = cameras.filter((item) => item.id !== url.searchParams.get('id')); data = null; }
        } else if (url.pathname === '/api/film/maintenance') {
            if (method === 'GET') data = maintenance.filter((item) => item.camera_id === url.searchParams.get('camera_id'));
            if (method === 'POST') {
                const record = { ...request.postDataJSON(), id: 'service-new' };
                maintenance.push(record); data = record;
            }
            if (method === 'DELETE') { maintenance = maintenance.filter((item) => item.id !== url.searchParams.get('id')); data = null; }
        } else if (url.pathname === '/api/film/rolls') {
            data = empty ? [] : [{ id: 'roll-a', film_name: 'Fujifilm 200', brand: 'Fuji', format: '35mm', iso: 200, status: 'PROCESSED', camera_id: 'camera-a', camera: cameras[0], frames_taken: 36, purchase_price: 35, cover_image_url: '/logo.png' }];
        }
        await route.fulfill({ json: { data } });
    });
    return { getCameraReads: () => cameraReads };
}

test('shows cameras below rolls, preserves filters and opens the selected camera', async ({ page }, testInfo) => {
    const fixture = await setup(page);
    await page.goto('/film');
    await expect(page.getByRole('heading', { name: 'Film & Camera Cupboard' })).toBeVisible();
    const rolls = page.getByRole('region', { name: 'Roll Library' });
    const cameras = page.getByRole('region', { name: 'Camera Collection' });
    await expect(cameras.getByRole('listitem')).toHaveCount(3);
    await expect(cameras.getByText('3 cameras')).toBeVisible();
    await expect(rolls.getByRole('img', { name: 'Fujifilm 200 cover' })).toBeVisible();
    const addRoll = rolls.getByRole('link', { name: 'Add roll', exact: true });
    await expect(addRoll).toHaveAttribute('href', '/film/new-roll');
    await addRoll.focus();
    await expect(addRoll).toBeFocused();
    expect((await cameras.boundingBox())!.y).toBeGreaterThan((await rolls.boundingBox())!.y);
    await page.getByPlaceholder('Search', { exact: true }).fill('no matching film');
    await expect(rolls.getByText('No rolls match these filters.')).toBeVisible();
    await expect(addRoll).toBeVisible();
    await expect(cameras.getByRole('listitem')).toHaveCount(3);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('combobox').filter({ hasText: 'All cameras' }).click();
    await page.getByRole('option', { name: 'Travel camera', exact: true }).click();
    await expect(rolls.getByText('No rolls match these filters.')).toBeVisible();
    await expect(cameras.getByRole('listitem')).toHaveCount(3);
    expect(fixture.getCameraReads()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await cameras.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('camera-cupboard.png'), fullPage: true });
    const travel = cameras.getByRole('link', { name: 'Open Travel camera camera' });
    await travel.focus();
    await expect(travel).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/film\/cameras\?camera=camera-b$/);
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('Travel camera');
    await expect(page.getByText('Travel lab', { exact: false })).toBeVisible();
});

test('keeps camera switching, creating, editing, deleting and maintenance working', async ({ page }) => {
    const fixture = await setup(page);
    await page.goto('/film/cameras?camera=camera-b');
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('Travel camera');
    await page.getByRole('button', { name: 'Weekend camera Nikon F3' }).click();
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('Weekend camera');
    await expect(page.getByText('No maintenance recorded.')).toBeVisible();
    expect(fixture.getCameraReads()).toBe(1);
    await page.getByRole('button', { name: 'Add Camera', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New camera' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Camera name' }).fill('New camera test');
    await page.locator('form').filter({ has: page.getByRole('heading', { name: 'New camera' }) }).getByRole('button', { name: 'Add Camera', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('New camera test');
    await page.getByRole('textbox', { name: 'Camera name' }).fill('Renamed camera');
    await page.getByRole('button', { name: 'Save Camera' }).click();
    await expect(page.getByRole('button', { name: 'Renamed camera', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Provider', exact: true }).fill('New service lab');
    await page.getByRole('button', { name: 'Add Maintenance' }).click();
    await expect(page.getByText('New service lab', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete maintenance record' }).click();
    await expect(page.getByText('No maintenance recorded.')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Renamed camera', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('Weekend camera');
});

test('falls back for missing or invalid camera links and handles empty cupboards', async ({ page }) => {
    await setup(page);
    for (const url of ['/film/cameras', '/film/cameras?camera=unknown']) {
        await page.goto(url);
        await expect(page.getByRole('textbox', { name: 'Camera name' })).toHaveValue('Weekend camera');
    }
    await page.unroute('**/api/film/**');
    await setup(page, true);
    await page.goto('/film');
    await expect(page.getByText('No rolls yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add roll', exact: true })).toHaveAttribute('href', '/film/new-roll');
    await expect(page.getByText('No cameras yet.')).toBeVisible();
    await page.getByRole('link', { name: 'Add Camera', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New camera' })).toBeVisible();
});
