import { expect, test } from '@playwright/test';

const route = '/log-viewer/barcode-generator';
const storageKey = 'idea-dump:barcode-generator:v1:browser-user';

test('generates and recalls mixed-case alphanumeric identifiers', async ({ page }, testInfo) => {
    await page.goto(route);
    const input = page.getByRole('textbox', { name: 'Value' });
    await expect(input).toHaveAttribute('inputmode', 'text');
    await expect(input).toHaveAttribute('autocapitalize', 'off');
    await expect(input).toHaveAttribute('autocorrect', 'off');
    await input.fill('GalFlip512BB25185');
    const barcode = page.getByRole('img', { name: 'Barcode for GalFlip512BB25185', exact: true });
    await expect(barcode).toBeVisible();
    await expect(barcode.locator('text')).toHaveText('GalFlip512BB25185');
    await input.fill('galflip512bb25185');
    await expect(page.getByRole('img', { name: 'Barcode for galflip512bb25185', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'GalFlip512BB25185', exact: true }).click();
    await expect(input).toHaveValue('GalFlip512BB25185');
    await expect(barcode).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Recent barcodes' }).getByRole('button')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('alphanumeric-barcode.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('generates automatically, preserves digits, and recalls seven values without network requests', async ({ page }, testInfo) => {
    await page.goto(route);
    await page.clock.install();
    const input = page.getByRole('textbox', { name: 'Value' });
    const recent = page.getByRole('complementary', { name: 'Recent barcodes' });
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    for (let i = 1; i <= 8; i++) {
        await input.fill('000' + i);
        await page.clock.runFor(400);
    }
    await expect(recent.getByRole('button')).toHaveCount(7);
    await expect(recent.getByRole('button').first()).toHaveText('0008');
    await expect(recent.getByRole('button', { name: '0001', exact: true })).toHaveCount(0);
    await input.fill('999');
    await expect(page.getByRole('img', { name: /^Barcode for/ })).toHaveCount(0);
    await recent.getByRole('button', { name: '0003', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.clock.runFor(500);
    await expect(input).toHaveValue('0003');
    await expect(page.getByRole('img', { name: 'Barcode for 0003' })).toBeVisible();
    await expect(recent.getByRole('button').first()).toHaveText('0003');
    await input.fill('0001234567890123456');
    await page.clock.runFor(400);
    const barcode = page.getByRole('img', { name: 'Barcode for 0001234567890123456' });
    await expect(barcode.locator('text')).toHaveText('0001234567890123456');
    await expect(barcode.locator(':scope > rect')).toHaveAttribute('fill', '#ffffff');
    await expect(page.getByRole('button', { name: /Generate|Clear|Print|Download/ })).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: testInfo.outputPath('barcode-generator.png'), fullPage: true });
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('link', { name: 'Barcode Generator', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Log Viewer', exact: true })).toHaveAttribute('href', '/log-viewer');
    await expect(page.getByRole('link', { name: 'View logs', exact: true })).toHaveCount(0);
    await expect(page.locator('#sidebar-log_viewer-submenu').getByRole('link')).toHaveCount(1);
    if (testInfo.project.name === 'mobile') {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await expect(barcode.locator(':scope > rect')).toHaveAttribute('fill', '#ffffff');
    await expect(barcode.locator('g')).toHaveAttribute('fill', '#000000');
});

test('retains history across navigation and reload, but isolates a fresh tab and clears on sign-out', async ({ page, context }) => {
    await page.goto(route);
    await page.getByRole('textbox', { name: 'Value' }).fill('000123');
    await expect(page.getByRole('img', { name: 'Barcode for 000123' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle test route' }).click();
    await page.getByRole('button', { name: 'Toggle test route' }).click();
    await expect(page.getByRole('button', { name: '000123', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Value' })).toHaveValue('');
    await expect(page.getByRole('button', { name: '000123', exact: true })).toBeVisible();
    const fresh = await context.newPage();
    await fresh.goto(route);
    await expect(fresh.getByText('No recent barcodes.')).toBeVisible();
    await fresh.close();
    await page.getByRole('button', { name: 'Toggle test route' }).click();
    await page.getByRole('button', { name: 'Test sign out' }).click();
    expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
    await page.reload();
    await expect(page.getByText('No recent barcodes.')).toBeVisible();
});

test('validates input and keeps oversized barcodes contained without compressing them', async ({ page }) => {
    await page.goto(route);
    const input = page.getByRole('textbox', { name: 'Value' });
    await input.fill('123 456');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('img', { name: /^Barcode for/ })).toHaveCount(0);
    await input.fill('1234567890'.repeat(10));
    const barcode = page.getByRole('img', { name: /^Barcode for/ });
    await expect(barcode).toBeVisible();
    await expect(page.getByText(/Use a wider screen/)).toBeVisible();
    const panelWidth = await page.getByLabel('Barcode image area').evaluate(panel => panel.clientWidth);
    expect(await barcode.evaluate(svg => svg.getBoundingClientRect().width)).toBeGreaterThan(panelWidth);
    expect(await barcode.evaluate(svg => svg.getBoundingClientRect().width)).toBe(parseFloat((await barcode.getAttribute('width'))!));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await input.fill('');
    await expect(barcode).toHaveCount(0);
    await expect(page.getByText(/Use a wider screen/)).toHaveCount(0);
});

test('recovers malformed and unavailable storage without losing generation', async ({ page }) => {
    await page.addInitScript(key => sessionStorage.setItem(key, 'broken-json'), storageKey);
    await page.goto(route);
    await expect(page.getByText('No recent barcodes.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Value' }).fill('001');
    await expect(page.getByRole('img', { name: 'Barcode for 001' })).toBeVisible();
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => { throw new Error('blocked'); };
        Storage.prototype.setItem = () => { throw new Error('blocked'); };
    });
    await page.reload();
    await page.getByRole('textbox', { name: 'Value' }).fill('002');
    await expect(page.getByRole('img', { name: 'Barcode for 002' })).toBeVisible();
    await expect(page.getByText(/Temporary storage is unavailable/)).toBeVisible();
});

test('hides generator without module access and cancels pending work on account change', async ({ page }) => {
    await page.goto(route + '?denied');
    await expect(page.getByRole('textbox', { name: 'Value' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Barcode Generator', exact: true })).toHaveCount(0);
    await page.goto(route);
    await page.clock.install();
    await page.getByRole('textbox', { name: 'Value' }).fill('123');
    await page.getByRole('button', { name: 'Test account switch' }).click();
    await page.clock.runFor(500);
    await expect(page.getByRole('textbox', { name: 'Value' })).toHaveValue('');
    await expect(page.getByText('No recent barcodes.')).toBeVisible();
    expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
});
