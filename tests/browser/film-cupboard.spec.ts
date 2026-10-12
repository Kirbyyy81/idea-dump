import { expect, test, type Page } from '@playwright/test';

const cameraFixture = [
    { id: 'camera-a', name: 'Weekend camera', brand: 'Nikon', model: 'F3', notes: '', purchase_date: '' },
    { id: 'camera-b', name: 'Travel camera', brand: 'Samsung', model: 'AF Slim Zoom', notes: '', purchase_date: '' },
    { id: 'camera-c', name: 'A camera with a very long name for the collection shelf', brand: 'Olympus', model: 'OM-1', notes: '', purchase_date: '' },
];

async function setup(page: Page, empty = false, rollCount = 1) {
    let cameras = empty ? [] : structuredClone(cameraFixture);
    const rolls = empty ? [] : Array.from({ length: rollCount }, (_, index) => ({ id: `roll-${index}`, film_name: index ? `Fujifilm 200 (${index + 1})` : 'Fujifilm 200', brand: 'Fuji', format: '35mm', iso: 200, status: 'PROCESSED', camera_id: 'camera-a', camera: cameras[0], frames_taken: 36, purchase_price: 35, cover_image_url: '/logo.png' }));
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
            if (method === 'POST') {
                const roll = { ...request.postDataJSON(), id: 'roll-new' };
                rolls.push(roll); data = roll;
            } else data = rolls;
        } else if (url.pathname.startsWith('/api/film/rolls/')) {
            data = rolls.find((roll) => roll.id === url.pathname.split('/').at(-1));
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

test('packs rolls closely and moves following rolls only when details expand', async ({ page, isMobile }, testInfo) => {
    await setup(page, false, 3);
    await page.goto('/film');
    const rolls = page.getByRole('region', { name: 'Roll Library' });
    const first = rolls.getByRole('link', { name: 'Open Fujifilm 200 roll', exact: true });
    const second = rolls.getByRole('link', { name: 'Open Fujifilm 200 (2) roll', exact: true });
    await expect(first).toBeVisible();
    const initialFirst = (await first.boundingBox())!;
    const initialSecond = (await second.boundingBox())!;
    if (!isMobile) expect(initialSecond.x - initialFirst.x).toBeLessThan(160);
    await page.screenshot({ path: testInfo.outputPath('compact-rolls.png'), fullPage: true });

    if (isMobile) await first.focus();
    else await first.hover();
    await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(250);
    if (!isMobile) await expect.poll(async () => (await second.boundingBox())!.x - initialSecond.x).toBeGreaterThan(130);
    else expect((await second.boundingBox())!.x).toBe(initialSecond.x);
    expect((await second.boundingBox())!.y).toBe(initialSecond.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: testInfo.outputPath('expanded-roll.png'), fullPage: true });

    if (isMobile) await first.blur();
    else await page.getByRole('heading', { name: 'Film & Camera Cupboard' }).hover();
    await expect.poll(async () => Math.abs((await second.boundingBox())!.x - initialSecond.x)).toBeLessThan(2);
    const addRoll = rolls.getByRole('link', { name: 'Add roll', exact: true });
    await addRoll.focus();
    await expect(addRoll).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/film\/new-roll$/);
});

test('keeps multiple rows fixed during hover and reflows on resize', async ({ page, isMobile }, testInfo) => {
    await setup(page, false, 24);
    await page.goto('/film');
    const shelf = page.getByRole('region', { name: 'Roll Library' });
    const rows = shelf.locator('[data-film-row]');
    const links = shelf.getByRole('link', { name: /^Open .* roll$/ });
    await expect(links).toHaveCount(24);
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
    const rowMembership = () => rows.evaluateAll((elements) => elements.map((row) => Array.from(row.querySelectorAll('a')).map((link) => link.getAttribute('href'))));
    const initialMembership = await rowMembership();
    const cameraTop = await page.getByRole('region', { name: 'Camera Collection' }).evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    const firstRowLinks = rows.first().getByRole('link', { name: /^Open .* roll$/ });
    const count = await firstRowLinks.count();
    for (const index of [...new Set([0, Math.floor(count / 2), count - 1])]) {
        const link = firstRowLinks.nth(index);
        if (isMobile) await link.focus(); else await link.hover();
        await expect.poll(async () => (await link.boundingBox())!.width).toBeGreaterThan(250);
        await expect(shelf.locator('[data-expanded=true]')).toHaveCount(1);
        expect(await rowMembership()).toEqual(initialMembership);
        expect(await page.getByRole('region', { name: 'Camera Collection' }).evaluate((element) => element.getBoundingClientRect().top + window.scrollY)).toBe(cameraTop);
    }
    await page.screenshot({ path: testInfo.outputPath('stable-shelf.png'), fullPage: !isMobile });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await links.first().focus();
    await expect.poll(async () => (await links.first().boundingBox())!.width).toBeGreaterThan(250);
    expect(await links.first().evaluate((element) => element.parentElement!.getAnimations({ subtree: true }).length)).toBe(0);
    await links.first().blur();
    for (const width of [768, 320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await expect(links).toHaveCount(24);
    }
    await page.getByPlaceholder('Search', { exact: true }).fill('(24)');
    await expect(links).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(links).toHaveCount(24);
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
});

test('preserves multiple rows after adding a roll, navigation and reload', async ({ page }) => {
    await setup(page, false, 24);
    await page.goto('/film');
    const rows = page.locator('[data-film-row]');
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
    await page.getByRole('link', { name: 'Add roll', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Register a Film Roll' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/film$/);
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
    await page.getByRole('link', { name: 'Add roll', exact: true }).click();
    await page.getByRole('textbox', { name: 'Film name' }).fill('Added roll');
    await page.getByRole('textbox', { name: 'Brand' }).fill('Kodak');
    await page.getByRole('button', { name: 'Place on Shelf' }).click();
    await expect(page).toHaveURL(/\/film\/rolls\/roll-new$/);
    await expect(page.getByRole('textbox', { name: 'Film name' })).toHaveValue('Added roll');
    await page.goto('/film');
    await expect(page.getByText('25 of 25 rolls')).toBeVisible();
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
    await page.reload();
    await expect(page.getByText('25 of 25 rolls')).toBeVisible();
    await expect.poll(() => rows.count()).toBeGreaterThan(1);
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
