import { expect, test } from '@playwright/test';
import { archivedTag, tripTag, tagTransactions } from './finance-tags-fixture';
test.beforeEach(async ({page})=> {
    await page.route('**/api/finance/reference-data', route=>route.fulfill({json:{data:{sources:[{id:tagTransactions[0].source_id,name:'Bank'}],categories:[],tags:[tripTag,archivedTag]}}}));
});
test('selects multiple tags, creates inline, and saves them in the editor',async({page},info)=>{
    let body: Record<string,unknown> | undefined;
    await page.route('**/api/finance/tags',route=>route.fulfill({json:{data:{id:'10000000-0000-4000-8000-000000000003',name:'New trip',is_archived:false}}}));
    await page.route('**/api/finance/transactions',async route=> {body=route.request().postDataJSON();await route.fulfill({json:{data:tagTransactions[0]}});});
    await page.goto('/finance/transactions/edit?id='+tagTransactions[0].id);
    await page.getByRole('button',{name:'Choose tags',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Search tags'})).toBeFocused();
    await expect(page.getByRole('button',{name:'Hackathon (archived)',exact:true})).toHaveCount(0);
    await page.getByRole('textbox',{name:'Search tags'}).fill('New trip');
    await page.getByRole('button',{name:'Create “New trip”'}).click();
    await expect(page.getByLabel('Selected tags')).toContainText('New trip');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Choose tags',exact:true})).toBeFocused();
    await page.screenshot({path:info.outputPath('tagged-editor.png'),fullPage:true});
    await page.getByRole('button',{name:'Save changes'}).click();
    await expect.poll(()=>body?.tag_ids).toEqual([tripTag.id,'10000000-0000-4000-8000-000000000003']);
});
test('includes archived tags in filters and preserves exclusions across dashboard navigation',async({page})=>{
    await page.goto('/finance?month=2026-09&tag_ids='+archivedTag.id+'&tag_mode=exclude');
    await expect(page.getByLabel('Selected tags')).toContainText('Hackathon');
    await expect(page.getByText('Budgets use their own filters.',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Previous month'}).click();
    await expect(page).toHaveURL(url => url.searchParams.get('month') === '2026-08' && url.searchParams.get('tag_ids') === archivedTag.id && url.searchParams.get('tag_mode') === 'exclude');
    const categories=page.getByRole('list',{name:'Spending categories'});
    const href = new URL((await categories.getByRole('link').first().getAttribute('href'))!, page.url());
    expect(href.searchParams.get('tag_ids')).toBe(archivedTag.id); expect(href.searchParams.get('tag_mode')).toBe('exclude');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for (const operation of ['add', 'remove'] as const) {
    test(`bulk ${operation} submits only selected transactions and selected tags`,async({page})=>{
        let body:Record<string,unknown>|undefined;
        await page.route('**/api/finance/transactions/tags',async route=>{body=route.request().postDataJSON();await route.fulfill({json:{data:{updated:1}}});});
        await page.goto('/finance/transactions');
        await expect(page.getByLabel('Transaction tags')).toContainText('Holiday');
        await expect(page.getByRole('checkbox')).toHaveCount(0);
        await page.getByRole('button',{name:'More transaction actions',exact:true}).click();
        await page.getByRole('menuitem',{name:'Tag transactions',exact:true}).click();
        await page.getByRole('checkbox',{name:'Select transaction Daily cafe'}).click();
        await expect(page.getByRole('checkbox',{name:'Select transaction Daily cafe'})).toBeChecked();
        await page.getByRole('button',{name:'Choose bulk tags'}).click();
        await page.getByRole('button',{name:'Holiday',exact:true}).click();
        await page.getByRole('button',{name:'Done',exact:true}).click();
        await page.getByRole('button',{name:operation === 'add' ? 'Add tags' : 'Remove tags',exact:true}).click();
        await expect.poll(()=>body).toEqual({transaction_ids:[tagTransactions[1].id],tag_ids:[tripTag.id],operation});
        await expect(page.getByRole('checkbox',{name:'Select transaction Daily cafe'})).not.toBeChecked();
    });
}
test('archives and restores tags without deleting historical assignments',async({page})=>{
    const calls:unknown[]=[];
    await page.route('**/api/finance/tags',async route=>{const body=route.request().postDataJSON();calls.push(body);await route.fulfill({json:{data:{...tripTag,...body}}});});
    await page.goto('/finance/settings?section=tags');
    await page.getByRole('button',{name:'Archive tag Holiday'}).click();
    await expect(page.getByRole('button',{name:'Restore tag Holiday'})).toBeVisible();
    await page.getByRole('button',{name:'Restore tag Holiday'}).click();
    await expect(page.getByRole('button',{name:'Archive tag Holiday'})).toBeVisible();
    expect(calls).toEqual([{id:tripTag.id,is_archived:true},{id:tripTag.id,is_archived:false}]);
});

test('More menu enables keyboard multi-select and Done tagging clears the selection', async ({ page }) => {
    await page.goto('/finance/transactions');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    const more = page.getByRole('button', { name: 'More transaction actions', exact: true });
    await more.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Tag transactions', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    const trip = page.getByRole('checkbox', { name: 'Select transaction Trip cafe', exact: true });
    const daily = page.getByRole('checkbox', { name: 'Select transaction Daily cafe', exact: true });
    await expect(trip).toBeVisible();
    const checkboxBox = await trip.boundingBox();
    const rowBox = await page.locator('[data-finance-transaction-row="default"]').filter({ hasText: 'Trip cafe' }).boundingBox();
    expect(checkboxBox!.x + checkboxBox!.width).toBeLessThanOrEqual(rowBox!.x);
    await trip.focus();
    await page.keyboard.press('Space');
    await expect(trip).toBeChecked();
    await daily.click();
    await expect(daily).toBeChecked();
    await expect(page.getByRole('region', { name: 'Bulk transaction tags' })).toContainText('2 selected');
    await trip.press('Space');
    await expect(trip).not.toBeChecked();
    await expect(page.getByRole('region', { name: 'Bulk transaction tags' })).toContainText('1 selected');
    await page.getByRole('button', { name: 'Done tagging', exact: true }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    await page.getByRole('menuitem', { name: 'Tag transactions', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Bulk transaction tags' })).toContainText('0 selected');
    await expect(trip).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const flow of [
    { name: 'manual entry', path: '/finance/add', label: 'Tags', baseline: 'Transaction category', baselineLabel: 'Category' },
    { name: 'editing', path: '/finance/transactions/edit?id=' + tagTransactions[0].id, label: 'Tags', baseline: 'Transaction category', baselineLabel: 'Category' },
    { name: 'dashboard filtering', path: '/finance', label: 'Filter tags', baseline: 'Tag matching', baselineLabel: 'Tag matching' },
    { name: 'ledger filtering', path: '/finance/transactions', label: 'Filter tags', baseline: 'Ledger category', baselineLabel: 'Category' },
    { name: 'bulk tagging', path: '/finance/transactions', label: 'Bulk tags', baseline: 'Ledger category', baselineLabel: 'Category' },
]) {
    test(`tag selector matches shared fields in ${flow.name}`, async ({ page }, info) => {
        await page.goto(flow.path);
        if (flow.name === 'manual entry') await page.getByRole('button', { name: 'Manual', exact: true }).click();
        if (flow.path === '/finance/transactions' && info.project.name === 'mobile') {
            await page.getByRole('button', { name: /^Filters/ }).click();
        }
        if (flow.name === 'bulk tagging') {
            await page.getByRole('button', { name: 'More transaction actions', exact: true }).click();
            await page.getByRole('menuitem', { name: 'Tag transactions', exact: true }).click();
        }
        const tags = page.getByRole('button', { name: `Choose ${flow.label.toLowerCase()}`, exact: true });
        const baseline = page.getByRole('combobox', { name: flow.baseline, exact: true });
        await expect(tags).toBeEnabled();
        await expect(tags).toBeVisible();
        await expect(baseline).toBeVisible();
        const properties = ['height', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'paddingLeft', 'paddingRight', 'borderRadius', 'borderColor', 'backgroundColor'] as const;
        const tagStyles = await tags.evaluate((element, properties) => properties.map(property => getComputedStyle(element)[property]), properties);
        const fieldStyles = await baseline.evaluate((element, properties) => properties.map(property => getComputedStyle(element)[property]), properties);
        expect(tagStyles).toEqual(fieldStyles);
        const label = page.getByText(flow.label, { exact: true });
        const baselineLabel = page.getByText(flow.baselineLabel, { exact: true });
        for (const property of ['font-size', 'font-weight', 'color']) {
            await expect(label).toHaveCSS(property, await baselineLabel.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property));
        }
        expect(await tags.locator('svg').count()).toBe(1);
        await tags.press('ArrowDown');
        const search = page.getByRole('textbox', { name: 'Search tags', exact: true });
        await expect(search).toBeFocused();
        await search.evaluate(input => input.blur());
        const holiday = page.getByRole('button', { name: 'Holiday', exact: true });
        const wasSelected = await holiday.getAttribute('aria-pressed') === 'true';
        await holiday.click();
        await expect(holiday).toHaveAttribute('aria-pressed', String(!wasSelected));
        if (wasSelected) await holiday.click();
        await expect(tags).toContainText('selected');
        await page.keyboard.press('Escape');
        await expect(tags).toBeFocused();
        if (flow.name === 'editing') await page.screenshot({ path: info.outputPath('consistent-tag-selector.png'), fullPage: true });
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
}

test('dashboard pointer selection persists multiple tags, exclusions and clearing across reloads', async ({ page }) => {
    await page.goto('/finance?month=2026-09&date=2026-09-17');
    const choose = page.getByRole('button', { name: 'Choose filter tags', exact: true });
    const selectTag = async (name: string) => {
        await choose.click();
        const search = page.getByRole('textbox', { name: 'Search tags', exact: true });
        await expect(search).toBeFocused();
        await search.evaluate(input => input.blur());
        await page.getByRole('button', { name, exact: true }).click();
        await page.getByRole('button', { name: 'Done', exact: true }).click();
    };
    await selectTag('Holiday');
    await expect(page).toHaveURL(url => url.searchParams.get('tag_ids') === tripTag.id && url.searchParams.get('month') === '2026-09' && url.searchParams.get('date') === '2026-09-17');
    await selectTag('Hackathon (archived)');
    const expectedIds = [tripTag.id, archivedTag.id].sort().join(',');
    await expect(page).toHaveURL(url => url.searchParams.get('tag_ids') === expectedIds && url.searchParams.get('tag_mode') === 'include');
    await page.reload();
    await expect(page.getByLabel('Selected tags')).toContainText('Holiday');
    await expect(page.getByLabel('Selected tags')).toContainText('Hackathon');
    await page.getByRole('combobox', { name: 'Tag matching', exact: true }).click();
    await page.getByRole('option', { name: 'Exclude tags', exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('tag_ids') === expectedIds && url.searchParams.get('tag_mode') === 'exclude' && url.searchParams.get('date') === '2026-09-17');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Tag matching', exact: true })).toContainText('Exclude tags');
    await choose.click();
    await page.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await expect(page).toHaveURL(url => !url.searchParams.has('tag_ids') && url.searchParams.get('month') === '2026-09');
    await expect(page.getByLabel('Selected tags')).toHaveCount(0);
});
