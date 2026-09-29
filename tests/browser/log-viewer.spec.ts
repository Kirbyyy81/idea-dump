import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
