import { expect, test } from '@playwright/test';

test('loads the full outline before offscreen tables, retries locally, and searches remaining content', async ({ page }, testInfo) => {
    const id = '11111111-1111-1111-1111-111111111111';
    const table = '22222222-2222-2222-2222-222222222222';
    const toggle = '33333333-3333-3333-3333-333333333333';
    const rich = (text: string) => [{ text, href: null, bold: false, italic: false, underline: false, strikethrough: false, code: false }];
    const block = (blockId: string, type: string, text: string, hasChildren = false) => ({ id: blockId, type, richText: rich(text), hasChildren });
    let releaseRoot!: () => void;
    let tableReads = 0;
    let toggleReads = 0;
    let rootReads = 0;
    const first = [block('heading', 'heading_1', 'Opening section'),
        ...Array.from({ length: 24 }, (_, index) => block(`paragraph-${index}`, 'paragraph', `Paragraph ${index + 1}. ${'Readable technical details. '.repeat(12)}`)),
        block(table, 'table', '', true), block(toggle, 'toggle', 'Extra details', true)];
    await page.route(`**/api/documentation/${id}/content?*`, async (route) => {
        const query = new URL(route.request().url()).searchParams;
        const parent = query.get('parentId');
        if (parent === table) {
            tableReads++;
            await route.fulfill(tableReads === 1 ? { status: 502, json: { message: 'Table unavailable' } }
                : { json: { data: { blocks: [{ ...block('row', 'table_row', ''), cells: [rich('Recovered table cell')] }], nextCursor: null } } });
        } else if (parent === toggle) {
            toggleReads++;
            await route.fulfill({ json: { data: { blocks: [block('nested-heading', 'heading_2', 'Nested section'), block('hidden', 'paragraph', 'needle inside toggle')], nextCursor: null } } });
        } else {
            rootReads++;
            if (!query.has('cursor')) await new Promise<void>((resolve) => { releaseRoot = resolve; });
            await route.fulfill({ json: { data: query.has('cursor')
                ? { blocks: [block('last-heading', 'heading_1', 'Final section'), block('last', 'paragraph', 'needle on final page')], nextCursor: null }
                : { blocks: first, nextCursor: 'next' } } });
        }
    });
    await page.goto(`/documentation/${id}`);
    await expect(page.getByRole('heading', { name: 'Hybrid Technical Documentation' })).toBeVisible();
    await expect.poll(() => rootReads).toBe(1);
    releaseRoot();
    await expect(page.getByRole('heading', { name: 'Opening section' })).toBeVisible();
    const contents = page.getByRole('navigation', { name: 'On this page' });
    await expect(contents.getByRole('link', { name: 'Final section' })).toBeVisible();
    await expect(contents.getByRole('link', { name: 'Nested section' })).toBeVisible();
    await expect(page.getByText('Loading table of contents…')).toHaveCount(0);
    expect(tableReads).toBe(0);
    expect(toggleReads).toBe(1);
    expect(rootReads).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('first-readable-content.png') });
    await page.getByLabel('Pending table', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Retry table' })).toBeVisible();
    await expect(page.getByText(/Paragraph 1\./)).toBeAttached();
    expect(toggleReads).toBe(1);
    await page.getByRole('button', { name: 'Retry table' }).click();
    await expect(page.getByRole('cell', { name: 'Recovered table cell' })).toBeVisible();
    expect(tableReads).toBe(2);
    await contents.getByRole('link', { name: 'Nested section' }).click();
    await expect(page.getByRole('heading', { name: 'Nested section' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Find in this document' }).fill('needle');
    await expect(page.getByText(/^[12] of 2$/)).toBeVisible();
    expect(toggleReads).toBe(1);
    expect(rootReads).toBe(2);
    await expect(page.getByText('Searching remaining sections…')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
});

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
