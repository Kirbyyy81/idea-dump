import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('returns to the paste field from a long log without clearing input or filters', async ({ page }, testInfo) => {
  const raw = readFileSync('lib/log-viewer/fixtures/yes-shop.txt', 'utf8').replace(/\r\n/g, '\n');
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles('lib/log-viewer/fixtures/yes-shop.txt');
  const input = page.getByRole('textbox', { name: 'Paste raw log text' });
  const back = page.getByRole('button', { name: 'Back to log input', exact: true });
  await expect(input).toHaveCount(0);
  await page.getByPlaceholder('Search endpoint / payload...').fill('get');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await expect(back).toBeInViewport();
  const box = (await back.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(viewport.width - box.x - box.width).toBeLessThanOrEqual(32);
  expect(viewport.height - box.y - box.height).toBeLessThanOrEqual(32);
  await page.screenshot({ path: testInfo.outputPath('back-to-log-input.png') });

  await back.focus();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(raw);
  await expect(page.getByRole('button', { name: /Import Logs/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByPlaceholder('Search endpoint / payload...')).toHaveValue('get');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  // Reusing the shortcut with an already open panel must still scroll and focus.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await back.click();
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(input).toHaveValue(raw);
  await expect(page.getByRole('heading', { name: 'Logs', exact: true })).toBeVisible();
});

test('expands all JSON levels and independently reveals raw lines using the keyboard', async ({ page }, testInfo) => {
  const deep = { result: [{ nested: { children: [{ name: 'Plan Advanced Payment', chargeAmount: null, isMandatoryAddon: true, url: 'https://example.test/' + 'long-path/'.repeat(35) }] } }] };
  const request = '2026-09-24 10:00:00.000 REQUEST https://example.test/yesshop/mobile/ws/v1/json/getPlanPriceInfo ' + JSON.stringify(deep);
  const response = '2026-09-24 10:00:00.100 RESPONSE https://example.test/yesshop/mobile/ws/v1/json/getPlanPriceInfo ' + JSON.stringify(deep);
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill(request + '\n' + response);
  const body = page.getByRole('region', { name: 'Request body' });
  const toggle = body.getByRole('button', { name: 'Request body', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(body.locator('code')).toHaveText(JSON.stringify(deep, null, 2));
  await expect(body.getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(body.getByRole('button', { name: 'Raw request line' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(body.getByRole('textbox', { name: 'Raw request line' })).toHaveValue(request);
  await expect(body.locator('code')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Response body' }).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(body.getByRole('textbox')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: testInfo.outputPath('expanded-json.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});

test('copies complete request and response JSON while folding with the keyboard', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Windows clipboard text uses CRLF even when writeText receives LF.
  const readClipboard = () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
  const requestBody = { plans: [{ details: { name: 'Example plan', addons: [true, null, 2] } }] };
  const responseBody = { result: { ok: true, value: '<script>escaped</script>' } };
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill([
    '2026-09-24 10:00:00.000 REQUEST https://example.test/yesshop/mobile/ws/v1/json/getPlanPriceInfo ' + JSON.stringify(requestBody),
    '2026-09-24 10:00:00.100 RESPONSE https://example.test/yesshop/mobile/ws/v1/json/getPlanPriceInfo ' + JSON.stringify(responseBody),
  ].join('\n'));
  const request = page.getByRole('region', { name: 'Request body' });
  const response = page.getByRole('region', { name: 'Response body' });
  await request.getByRole('button', { name: 'Copy request JSON' }).focus();
  await page.keyboard.press('Enter');
  await expect(request.getByRole('status')).toHaveText('JSON copied.');
  expect(await readClipboard()).toBe(JSON.stringify(requestBody, null, 2));
  await expect(request.locator('code')).toHaveCount(0);

  await request.getByRole('button', { name: 'Request body', exact: true }).click();
  const path = '$["plans"]';
  await request.getByRole('button', { name: 'Collapse ' + path, exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(request.getByRole('button', { name: 'Expand ' + path, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(request.locator('code')).not.toContainText('Example plan');
  await request.getByRole('button', { name: 'Copy request JSON' }).click();
  expect(await readClipboard()).toBe(JSON.stringify(requestBody, null, 2));
  await request.getByRole('button', { name: 'Expand ' + path, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(request.locator('code')).toHaveText(JSON.stringify(requestBody, null, 2));
  await request.getByRole('button', { name: 'Collapse all' }).click();
  await expect(request.locator('code')).toHaveText('{…}');

  await response.getByRole('button', { name: 'Response body', exact: true }).click();
  await expect(response.locator('code')).toHaveText(JSON.stringify(responseBody, null, 2));
  await response.getByRole('button', { name: 'Copy response JSON' }).focus();
  await page.keyboard.press('Space');
  await expect(response.getByRole('status')).toHaveText('JSON copied.');
  expect(await readClipboard()).toBe(JSON.stringify(responseBody, null, 2));
  await expect(request.locator('code')).toHaveText('{…}');
  await request.getByRole('button', { name: 'Expand all' }).click();
  await expect(request.locator('code')).toHaveText(JSON.stringify(requestBody, null, 2));
  await expect(request.getByRole('button', { name: 'Copy request JSON' })).toHaveAttribute('title', 'Copy request JSON');
  await expect(response.getByRole('button', { name: 'Copy response JSON' })).toHaveAttribute('title', 'Copy response JSON');
  await expect(response.getByRole('button', { name: 'Copy response JSON' })).toHaveText('');
  await expect(response.getByRole('button', { name: 'Copy response JSON' }).locator('svg')).toBeVisible();
  const headerButtons = await response.locator('section > div').first().getByRole('button').all();
  const boxes = await Promise.all(headerButtons.map(button => button.boundingBox()));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('copy-and-fold-json.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});

for (const source of ['yes-shop', 'ussp']) {
  test(`imports ${source} and preserves grouped missing-request content`, async ({ page }) => {
    await page.goto('/log-viewer');
    await page.locator('#log-viewer-file-input').setInputFiles(`lib/log-viewer/fixtures/${source}.txt`);
    const endpoint = source === 'yes-shop' ? 'verifyImageWithVideo' : 'paymentProcessForQueue';
    await page.getByPlaceholder('Search endpoint / payload...').fill(endpoint);
    await page.getByRole('button').filter({ hasText: 'Request not logged' }).click();
    await expect(page.getByText('Request not logged.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Content data payload', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Content data payload' }).locator('pre')).toBeVisible();
    await page.getByRole('button', { name: 'Raw response line', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Raw response line' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  });
}

test('requires explicit parsing for a large paste and keeps the viewer responsive', async ({ page }) => {
  const fixture = readFileSync('lib/log-viewer/fixtures/yes-shop.txt', 'utf8');
  // Keep the event count representative while making each payload larger.
  const padding = JSON.stringify({ sample: 'a'.repeat(540_000) });
  const large = fixture + '\n2026-09-24 10:44:00.000 RESPONSE https://example.test/yesshop/mobile/ws/v1/json/Large ' + padding;
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill(large);
  await expect(page.getByRole('button', { name: 'Parse log', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parse log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Logs', exact: true })).toBeVisible();
  await page.getByPlaceholder('Search endpoint / payload...').fill('getPlanPriceInfo');
  await page.getByRole('button').filter({ hasText: /^ok/ }).filter({ hasText: 'getPlanPriceInfo' }).click();
  await page.getByRole('button', { name: 'Response body', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Response body' }).locator('code')).toContainText('connectionPriceInfoList');
});
