import { expect, test } from '@playwright/test';

const fixture = 'lib/log-viewer/fixtures/yes-shop-session.txt';

test('shows the last recorded log first after import and filtering, preserving raw line jumps', async ({ page }) => {
  const lines = [
    '2026-10-20 10:00:20.000 REQUEST https://example.test/ussp/v1/First {}',
    '2026-10-20 10:00:21.000 RESPONSE https://example.test/ussp/v1/First {}',
    '2026-10-20 10:00:10.000 EARLIER_MARKER >>> earlier',
    '2026-10-20 10:00:10.000 LATEST_MARKER >>> latest',
  ];
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill(lines.join('\n'));
  const rows = page.getByRole('button').filter({ hasText: /LATEST_MARKER|EARLIER_MARKER|\/ussp\/v1\/First/ });
  await expect(rows).toHaveText([/LATEST_MARKER/, /EARLIER_MARKER/, /\/ussp\/v1\/First/]);
  await expect(rows.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Newest first', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Info details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Info details' }).locator('pre')).toHaveText('latest');
  const search = page.getByPlaceholder('Search endpoint / payload...');
  await search.fill('MARKER');
  await expect(rows).toHaveText([/LATEST_MARKER/, /EARLIER_MARKER/]);
  await page.getByRole('button', { name: 'Go to raw line 4', exact: true }).first().click();
  const input = page.getByRole('textbox', { name: 'Paste raw log text' });
  await expect(input).toHaveValue(lines.join('\n'));
  expect(await input.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    return field.value.slice(field.selectionStart, field.selectionEnd);
  })).toBe(lines[3]);
  await search.fill('');
  await page.getByRole('combobox', { name: 'Filter by line type' }).click();
  await page.getByRole('option', { name: 'Info', exact: true }).click();
  await expect(rows).toHaveText([/LATEST_MARKER/, /EARLIER_MARKER/]);
});

test('automatically shows reader diagnostics in one expandable block with compact entries', async ({ page }, testInfo) => {
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles('lib/log-viewer/fixtures/ussp-reader.txt');
  const summary = page.locator('summary').filter({ hasText: 'SECURE_METRIC_READER' });
  const group = page.locator('details').filter({ has: summary });
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText('6 events');
  await expect(summary).toContainText('1 error');
  await expect(summary).toContainText('USSP');
  await expect(summary).toContainText('lines 3-8');
  await expect(group).not.toHaveAttribute('open');
  await expect(page.getByRole('button').filter({ hasText: 'SECURE_METRIC_READER' })).toHaveCount(0);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('open');
  await expect(group.getByRole('button', { name: 'Reader details', exact: true })).toHaveCount(6);
  for (const button of await group.getByRole('button', { name: 'Reader details', exact: true }).all()) {
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(group.getByRole('button', { name: /^Go to raw line \d+$/ })).toHaveText(['L8', 'L7', 'L6', 'L5', 'L4', 'L3']);
  await expect(group.getByRole('region', { name: 'Reader details' }).first().locator('pre')).toContainText('event=FINISHED');
  const payload = group.getByRole('region', { name: 'Reader details' }).nth(3);
  await expect(payload.locator('code')).toContainText('"sample": "001"');
  await payload.getByRole('button', { name: /^Show JSON at / }).click();
  await expect(payload).toContainText('"ready"');
  await payload.getByRole('button', { name: 'Raw info line', exact: true }).click();
  await expect(payload.getByRole('textbox')).toHaveValue(/SECURE_METRIC_READER_DATA.*session=test.*sample/);
  await group.getByRole('button', { name: 'Go to raw lines 3-8', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Paste raw log text' });
  await expect(input).toBeFocused();
  expect(await input.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    return field.value.slice(field.selectionStart, field.selectionEnd).split('\n').length;
  })).toBe(6);
  await page.getByRole('button', { name: 'Filter errors', exact: true }).click();
  await expect(summary).toContainText('1 event');
  await expect(summary).toContainText('1 error');
  await page.getByRole('button', { name: 'Filter errors', exact: true }).click();
  await page.getByPlaceholder('Search endpoint / payload...').fill('state=READY');
  await expect(summary).toContainText('1 event');
  await page.getByPlaceholder('Search endpoint / payload...').fill('');
  await summary.click();
  await expect(group).toHaveAttribute('open');
  await page.screenshot({ path: testInfo.outputPath('reader-group.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(group).not.toHaveAttribute('open');
  await expect(group.getByRole('button', { name: 'Reader details', exact: true })).toHaveCount(0);
  await summary.click();
  await expect(group.getByRole('button', { name: 'Reader details', exact: true })).toHaveCount(6);
  await expect(group.getByRole('region', { name: 'Reader details' }).first().locator('pre')).toContainText('event=FINISHED');
});

test('shows response status, surrounding text, host, source and recorded session context', async ({ page }, testInfo) => {
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles(fixture);
  const failed = page.getByRole('button').filter({ hasText: 'GetAppVersion' }).filter({ hasText: '401' }).first();
  await expect(failed).toContainText('openapi.example.test');
  await expect(failed).toContainText('10:00:00.000');
  await expect(failed).toContainText('Yes Shop');
  await failed.click();
  const response = page.getByRole('region', { name: 'Response body' });
  await response.getByRole('button', { name: 'Response body', exact: true }).click();
  await expect(response.getByLabel('Surrounding payload text')).toContainText('Error Code - 401');
  await expect(response.getByLabel('Surrounding payload text')).toContainText('retry pending');
  await expect(response.locator('code')).toHaveText('{\n  "response_id": "version-1",\n  "message": "Expired"\n}');
  await page.getByText('Session context', { exact: true }).click();
  const context = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Session context$/ }) });
  await expect(context).toContainText('Refresh Token Generated');
  await context.getByRole('button').filter({ hasText: 'Refresh Token Generated' }).click();
  await expect(page.getByRole('button', { name: 'Info details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Info details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Info details' }).locator('pre')).toHaveText('synthetic.header.signature');
  await page.screenshot({ path: testInfo.outputPath('session-diagnostics.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
});

test('groups auth events optionally and keeps tokens out of endpoint choices', async ({ page }) => {
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles(fixture);
  await page.getByRole('switch', { name: 'Group auth events' }).click();
  const group = page.locator('summary').filter({ hasText: 'Auth and token events' });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('1 error');
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(group.locator('..').locator(':scope > div > div[id^="log-tx_"]')).toHaveText([
    /Refresh Token Generated/, /openid-connect\/token/, /Auth Token Requested/, /GetAppVersion/,
  ]);
  await page.getByRole('button').filter({ hasText: 'Refresh Token Generated' }).first().click();
  await expect(page.getByRole('button', { name: 'Info details', exact: true })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Filter by endpoint' }).click();
  await expect(page.getByRole('option').filter({ hasText: 'synthetic.header.signature' })).toHaveCount(0);
  await page.getByRole('option', { name: 'Refresh Token Generated', exact: true }).click();
  await expect(group).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Info details', exact: true })).toHaveCount(1);
  await page.getByRole('switch', { name: 'Group auth events' }).click();
  await expect(page.getByRole('button', { name: 'Info details', exact: true })).toHaveCount(1);
});

test('searches standalone content, filters sources and jumps from grouped unparsed lines to the full input', async ({ page }) => {
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles(fixture);
  const search = page.getByPlaceholder('Search endpoint / payload...');
  await search.fill('standalone-needle');
  await expect(page.getByText('No logs match the current filters.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Content data payload', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Content data payload' }).locator('code')).toContainText('standalone-needle');
  await page.getByRole('combobox', { name: 'Filter by source' }).click();
  await page.getByRole('option', { name: 'USSP', exact: true }).click();
  await expect(page.getByText('No logs match the current filters.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter by source' }).click();
  await page.getByRole('option', { name: 'Yes Shop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Content data payload', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filter by source' })).toBeFocused();
  await search.fill('');
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: 'Filter unmatched content', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter unmatched content', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Request body', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter unparsed', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Unparsed lines 1-2' })).toHaveValue('unrecognized startup line\nunrecognized startup continuation');
  await page.getByRole('button', { name: 'Go to raw lines 1-2', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Paste raw log text' });
  await expect(input).toBeFocused();
  expect(await input.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    return field.value.slice(field.selectionStart, field.selectionEnd);
  })).toBe('unrecognized startup line\nunrecognized startup continuation');
});

test('uses summary cards to filter errors and orphans without hiding their status', async ({ page }) => {
  await page.goto('/log-viewer');
  await page.locator('#log-viewer-file-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Filter errors', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toContainText('Errors');
  await expect(page.getByRole('button').filter({ hasText: '401' }).filter({ hasText: 'GetAppVersion' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Filter orphans', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toContainText('All orphans');
  await expect(page.getByRole('button').filter({ hasText: 'Request not logged' }).filter({ hasText: '400' })).toHaveCount(1);
});

test('automatically parses large uploads and rejects files over 10 MB before replacing the input', async ({ page }) => {
  await page.goto('/log-viewer');
  const text = '2026-10-15 10:00:00.000 RESPONSE https://example.test/yesshop/v1/Large ' + JSON.stringify({ sample: 'a'.repeat(260000) });
  await page.locator('#log-viewer-file-input').setInputFiles({ name: 'large.log', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.getByRole('heading', { name: 'Logs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parse log', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to log input', exact: true }).click();
  await page.locator('#log-viewer-file-input').setInputFiles({ name: 'oversized.log', mimeType: 'text/plain', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 97) });
  await expect(page.getByRole('alert')).toHaveText('Choose a log file of 10 MB or smaller.');
  await expect(page.getByRole('textbox', { name: 'Paste raw log text' })).toHaveValue(text);
});

test('keeps malformed payload text visible with parse-warning chips on collapsed rows', async ({ page }) => {
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill('2026-10-15 10:00:00.000 RESPONSE https://example.test/yesshop/v1/Broken before {"broken": } after');
  await expect(page.getByText('JSON parse warning').first()).toBeVisible();
  await page.getByRole('button', { name: 'Response body', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Response body' }).locator('pre')).toHaveText('before {"broken": } after');
});

test('selects raw lines beyond the truncated preview', async ({ page }) => {
  const target = '2026-10-15 10:00:01.000 RESPONSE https://example.test/yesshop/v1/Target {}';
  await page.goto('/log-viewer');
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill('2026-10-15 10:00:00.000 INFO >>> ' + 'a'.repeat(60000) + '\n' + target);
  await page.getByRole('button', { name: 'Go to raw line 2', exact: true }).first().click();
  const input = page.getByRole('textbox', { name: 'Paste raw log text' });
  await expect(input).toBeFocused();
  const selection = await input.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    return { start: field.selectionStart, text: field.value.slice(field.selectionStart, field.selectionEnd) };
  });
  expect(selection.start).toBeGreaterThan(50000);
  expect(selection.text).toBe(target);
});

test('preserves newer pasted input against delayed or failed file reads', async ({ page }) => {
  await page.goto('/log-viewer');
  await page.clock.install();
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function() {
      if (this.name === 'failed.log') throw new Error('synthetic read failure');
      const text = await read.call(this);
      if (this.name === 'slow.log') await new Promise(resolve => setTimeout(resolve, 1000));
      return text;
    };
  });
  await page.locator('#log-viewer-file-input').setInputFiles({ name: 'slow.log', mimeType: 'text/plain', buffer: Buffer.from('old file') });
  const text = '2026-10-15 10:00:00.000 RESPONSE https://example.test/yesshop/v1/NewInput {}';
  await page.getByRole('textbox', { name: 'Paste raw log text' }).fill(text);
  await page.clock.runFor(1500);
  await page.getByRole('button', { name: 'Back to log input' }).click();
  await expect(page.getByRole('textbox', { name: 'Paste raw log text' })).toHaveValue(text);
  await page.locator('#log-viewer-file-input').setInputFiles({ name: 'failed.log', mimeType: 'text/plain', buffer: Buffer.from('unreadable') });
  await expect(page.getByRole('alert')).toHaveText('Could not read this log file. Try again.');
  await expect(page.getByRole('textbox', { name: 'Paste raw log text' })).toHaveValue(text);
});
