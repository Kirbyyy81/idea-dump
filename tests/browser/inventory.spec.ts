import { test, expect, type Page } from '@playwright/test';
import { inventoryFixture, inventoryIds as id } from '../fixtures/inventory';
import type { InventoryData, InventoryMutation } from '../../lib/types';

async function setup(page: Page, initial: InventoryData = structuredClone(inventoryFixture)) {
    const data = initial;
    const commands: InventoryMutation[] = [];
    let failNext = false;
    await page.addInitScript((fixture) => { (window as unknown as { inventoryInitial: InventoryData }).inventoryInitial = fixture; }, data);
    await page.route('**/api/inventory', async (route) => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { data } });
        const command = route.request().postDataJSON() as InventoryMutation;
        commands.push(command);
        if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: 'Temporary failure. Retry your cart.' } }); }
        let resultId = '16000000-0000-4000-8000-000000000099';
        if (command.action === 'save_product') {
            const { variants, ...product } = command.payload; resultId = product.id;
            data.products = [...data.products.filter((item) => item.id !== product.id), { ...product, revision: product.revision + 1, created_at: '2026-10-05T00:00:00Z' }];
            data.variants = [...data.variants.filter((item) => item.product_id !== product.id), ...variants.map((variant) => ({ ...variant, product_id: product.id }))];
        } else if (command.action === 'start') {
            const batch = data.batches.find((item) => item.id === command.payload.batch_id)!;
            batch.unopened_units -= 1;
            data.usages.unshift({ id: resultId, batch_id: batch.id, status: 'in_use', started_on: command.payload.started_on, finished_on: null, revision: 1, created_at: '2026-10-05T00:00:00Z' });
        } else if (command.action === 'finish' || command.action === 'edit_usage') {
            const usage = data.usages.find((item) => item.id === command.payload.usage_id)!;
            Object.assign(usage, command.payload, { status: command.action === 'finish' ? 'finished' : usage.status, revision: usage.revision + 1 });
        } else if (command.action === 'edit_purchase') {
            const purchase = data.purchases.find((item) => item.id === command.payload.purchase_id)!;
            Object.assign(purchase, { kind: command.payload.kind, purchased_on: command.payload.purchased_on, revision: purchase.revision + 1 });
            for (const line of command.payload.lines) {
                const batch = data.batches.find((item) => item.id === line.batch_id)!;
                const units = line.quantity * batch.snapshot.pack_quantity;
                Object.assign(batch, { purchased_quantity: line.quantity, original_units: units, unopened_units: batch.unopened_units + units - batch.original_units, total_paid: line.total_paid });
            }
        } else if (command.action === 'link_finance') {
            data.purchases.find((purchase) => purchase.id === command.payload.purchase_id)!.finance_transaction_id = command.payload.finance_transaction_id;
        }
        return route.fulfill({ json: { data: { id: resultId } } });
    });
    await page.route('**/api/inventory/expenses?*', (route) => route.fulfill({ json: { data: { expenses: [{ id: id.purchase, merchant: 'Essentials shop', amount: 180, transaction_date: '2026-10-01', currency: 'MYR' }], total: 1, page: 1 } } }));
    await page.goto('/inventory');
    return { commands, failNext: () => { failNext = true; } };
}
async function choose(page: Page, label: string, option: string, inDialog = false) {
    const scope = inDialog ? page.getByRole('dialog') : page;
    await scope.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}
test('shelf totals, breakdown, estimate, and read-only price comparison', async ({ page }, info) => {
    const { commands } = await setup(page);
    const shampoo = page.getByRole('article', { name: 'Dove Shampoo' });
    await expect(shampoo.getByText('1,250 ml unopened', { exact: true })).toBeVisible();
    await expect(shampoo.getByText('1 in use', { exact: true })).toBeVisible();
    await expect(shampoo.getByText('Approximately 100 days of unopened stock')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Tissues' }).getByText('10 boxes unopened')).toBeVisible();
    await shampoo.getByRole('button', { name: /View breakdown/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Dove Shampoo', exact: true });
    await expect(dialog.getByText('2 unopened · 1 in use')).toBeVisible();
    await dialog.getByLabel('Price for one pack / item (RM)').fill('22');
    await expect(dialog.getByText(/more expensive than usual/)).toBeVisible();
    expect(commands).toHaveLength(0);
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('inventory-shelf.png'), fullPage: true });
});
test('receives a multi-item cart and retries with the same identity', async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Add stock', exact: true }).first().click();
    await choose(page, 'Product', 'Tissues');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    let line = page.getByRole('region', { name: 'Cart item 1' });
    await line.getByLabel('Quantity purchased').fill('2');
    await line.getByLabel('Price (RM)', { exact: true }).fill('15');
    const priceBounds = await line.getByLabel('Price (RM)', { exact: true }).boundingBox();
    const basisBounds = await line.getByRole('combobox', { name: 'Price basis' }).boundingBox();
    expect(Math.abs(priceBounds!.y - basisBounds!.y)).toBeLessThan(2);
    await choose(page, 'Price basis', 'Total');
    await expect(line.getByText(/RM\s*15\.00/)).toBeVisible();
    await choose(page, 'Price basis', 'Per pack');
    await expect(line.getByText(/RM\s*30\.00/)).toBeVisible();
    await expect(line.getByText(/Adds 10 boxes unopened/)).toBeVisible();
    await choose(page, 'Product', 'Dove Shampoo');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    line = page.getByRole('region', { name: 'Cart item 2' });
    await line.getByLabel('Price (RM)', { exact: true }).fill('18');
    state.failNext();
    await page.getByRole('button', { name: 'Add to shelf', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary failure');
    await expect(page.getByRole('alert').locator('..')).toHaveCSS('position', 'fixed');
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Cart item 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to shelf', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(state.commands).toHaveLength(2);
    expect(state.commands[0]).toEqual(state.commands[1]);
    expect(state.commands[0]).toMatchObject({ action: 'receive', payload: { kind: 'purchase', lines: [{ quantity: 2, price: 15 }, { quantity: 1, price: 18 }] } });
});
test('creates a product from the receiving cart and adds existing opened stock', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('button', { name: 'Add stock', exact: true }).first().click();
    await page.getByRole('button', { name: 'New product', exact: true }).click();
    await page.getByLabel('Product name').fill('Face cleanser');
    await page.getByLabel('Variant 1 name').fill('150 ml bottle');
    await page.getByLabel('Size per item (ml)').fill('150');
    await page.getByRole('button', { name: 'Create product', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Receive stock', exact: true })).toBeVisible();
    await choose(page, 'Stock source', 'Existing stock');
    await page.getByRole('button', { name: 'Clear purchase date' }).click();
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.getByLabel('Items already in use').fill('1');
    await page.getByRole('button', { name: 'Add to shelf', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands[1]).toMatchObject({ action: 'receive', payload: { kind: 'existing', purchased_on: null, lines: [{ price: null, in_use_quantity: 1, started_on: null }] } });
});
test('starts a box rather than a multipack and finishes it through usage history', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('article', { name: 'Tissues' }).getByRole('button', { name: 'Start using' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start using', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Tissues' }).getByText('9 boxes unopened')).toBeVisible();
    await page.getByRole('link', { name: 'Usage history', exact: true }).click();
    const usage = page.getByText('Tissues · Five boxes', { exact: true }).locator('..').locator('..');
    await usage.getByRole('button', { name: 'Finished', exact: true }).click();
    await page.getByRole('dialog', { name: 'Finished', exact: true }).getByRole('button', { name: 'Finished', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands.map((command) => command.action)).toEqual(['start', 'finish']);
    await page.getByRole('link', { name: 'Inventory', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Tissues' }).getByText('0 in use')).toBeVisible();
});
test('links and unlinks an existing Finance expense from purchase history', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('link', { name: 'Purchases', exact: true }).click();
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Link Finance expense', exact: true }).click();
    await expect(page.getByText('Essentials shop', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(page.getByText('Linked to a Finance expense', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Changes saved.');
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Change Finance link', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Finance link', exact: true }).click();
    await expect(page.getByText('Linked to a Finance expense', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Changes saved.');
    expect(commands.map((command) => command.action)).toEqual(['link_finance', 'link_finance']);
});

test('edits size variants while retaining historical quantities', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('button', { name: 'Dove Shampoo', exact: true }).click();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByRole('region', { name: 'Variant 1', exact: true }).getByLabel('Size per item (ml)').fill('450');
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('article', { name: 'Dove Shampoo' }).getByText('1,250 ml unopened', { exact: true })).toBeVisible();
    expect(commands[0]).toMatchObject({ action: 'save_product', payload: { revision: 1, variants: [{ size: 450 }, { size: 250 }] } });
});

test('records stock corrections separately from usage', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('button', { name: 'Tissues', exact: true }).click();
    await page.getByRole('button', { name: 'Adjust stock', exact: true }).click();
    await choose(page, 'Reason', 'Given away');
    await page.getByLabel('Change in individual items').fill('-2');
    await page.getByRole('dialog').getByRole('button', { name: 'Adjust stock', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands[0]).toMatchObject({ action: 'adjust', payload: { batch_id: id.tissueBatch, usage_id: null, quantity: -2, reason: 'given_away' } });
});


test('Inventory submodules have persistent routes and browser history', async ({ page }) => {
    await setup(page);
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Shelf', exact: true })).toHaveCount(0);
    await expect(page.locator('a[href="/inventory"]')).toHaveCount(1);
    await page.getByRole('link', { name: 'Purchases', exact: true }).click();
    await expect(page).toHaveURL(/\/inventory\/purchases$/);
    await expect(page.getByRole('heading', { name: 'Purchases', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Purchases', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Usage history', exact: true }).click();
    await expect(page).toHaveURL(/\/inventory\/usage$/);
    await expect(page.getByRole('heading', { name: 'Usage history', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Purchases', exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Usage history', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test('subcategories can be added, reused, filtered, and cleared', async ({ page }) => {
    const { commands } = await setup(page);
    await expect(page.getByRole('combobox', { name: 'Subcategory', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Dove Shampoo', exact: true }).click();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveText('Shampoo');
    await choose(page, 'Subcategory', 'Add subcategory', true);
    const subcategoryInput = page.getByRole('dialog').getByRole('textbox', { name: 'Subcategory', exact: true });
    await expect(subcategoryInput).toBeFocused();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveCount(0);
    await subcategoryInput.fill('Conditioner');
    await page.getByRole('button', { name: 'Choose existing subcategory', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveText('Conditioner');
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands[0]).toMatchObject({ action: 'save_product', payload: { category: 'Hair Care', subcategory: 'Conditioner' } });
    await choose(page, 'Category', 'Hair Care');
    await choose(page, 'Subcategory', 'Conditioner');
    await expect(page.getByRole('article', { name: 'Dove Shampoo' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Tissues' })).not.toBeVisible();
    await choose(page, 'Category', 'Household');
    await expect(page.getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveText('All subcategories');
    await expect(page.getByRole('article', { name: 'Tissues' })).toBeVisible();
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await choose(page, 'Subcategory', 'Conditioner', true);
    await page.getByRole('dialog').getByRole('textbox', { name: /^Category/ }).fill('Skin Care');
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveText('None');
    await page.getByRole('dialog').getByRole('combobox', { name: 'Subcategory', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Conditioner', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await choose(page, 'Category', 'Hair Care');
    await page.getByRole('button', { name: 'Dove Shampoo', exact: true }).click();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await choose(page, 'Subcategory', 'None', true);
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands[1]).toMatchObject({ action: 'save_product', payload: { subcategory: null } });
});

test('edits a complete purchase from product history and preserves usage and Finance links', async ({ page }) => {
    const fixture = structuredClone(inventoryFixture);
    fixture.purchases[0].finance_transaction_id = id.purchase;
    const { commands, failNext } = await setup(page, fixture);
    await page.getByRole('button', { name: 'Dove Shampoo', exact: true }).click();
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Edit purchase', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit purchase', exact: true });
    await expect(dialog.getByRole('region')).toHaveCount(3);
    const line = dialog.getByRole('region', { name: 'Purchase item 1', exact: true });
    await line.getByLabel('Quantity purchased').fill('4');
    await line.getByLabel('Line total (RM)').fill('68');
    await expect(line.getByText(/1,500 ml unopened after saving/)).toBeVisible();
    failNext();
    await dialog.getByRole('button', { name: 'Save purchase', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(line.getByLabel('Line total (RM)')).toHaveValue('68');
    await dialog.getByRole('button', { name: 'Dismiss notification' }).click();
    await dialog.getByRole('button', { name: 'Save purchase', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[1]).toMatchObject({ action: 'edit_purchase', payload: { purchase_id: id.purchase, revision: 1, lines: [{ batch_id: id.largeBatch, quantity: 4, total_paid: 68 }, { batch_id: id.smallBatch }, { batch_id: id.tissueBatch }] } });
    await expect(page.getByRole('article', { name: 'Dove Shampoo' }).getByText('1,750 ml unopened', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Dove Shampoo' }).getByText('1 in use', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Purchases', exact: true }).click();
    await expect(page.getByText('Linked to a Finance expense', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Edit purchase', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Purchase item 1', exact: true }).getByLabel('Line total (RM)')).toHaveValue('68');
    await page.keyboard.press('Escape');
    expect(commands).toHaveLength(2);
});

test('edits existing stock with unknown price and date', async ({ page }) => {
    const fixture = structuredClone(inventoryFixture);
    fixture.purchases[0].kind = 'existing'; fixture.purchases[0].purchased_on = null;
    fixture.batches[0].total_paid = null;
    const { commands } = await setup(page, fixture);
    await page.getByRole('link', { name: 'Purchases', exact: true }).click();
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Edit purchase', exact: true }).click();
    const line = page.getByRole('region', { name: 'Purchase item 1', exact: true });
    await expect(line.getByLabel('Line total (RM)')).toHaveValue('');
    await line.getByLabel('Line total (RM)').fill('42');
    await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(commands[0]).toMatchObject({ action: 'edit_purchase', payload: { kind: 'existing', purchased_on: null, lines: [{ total_paid: 42 }, { total_paid: 10 }, { total_paid: 30 }] } });
    await expect(page.getByRole('status')).toHaveText('Changes saved.');
});

test('Finance expense loading errors use a toast and keep retry available', async ({ page }) => {
    await setup(page);
    await page.route('**/api/inventory/expenses?*', (route) => route.fulfill({ status: 503, json: { error: 'Could not load expenses.' } }));
    await page.getByRole('link', { name: 'Purchases', exact: true }).click();
    await page.getByRole('button', { name: 'Purchase actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Link Finance expense', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Could not load expenses.');
    await expect(page.getByRole('alert').locator('..')).toHaveCSS('position', 'fixed');
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Could not load expenses.');
});

test('a failed refresh after saving shows only an error toast', async ({ page }) => {
    const { commands } = await setup(page);
    await page.getByRole('button', { name: 'Dove Shampoo', exact: true }).click();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.route('**/api/inventory', (route) => route.request().method() === 'GET'
        ? route.fulfill({ status: 503, json: { error: 'Read failed' } }) : route.fallback());
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Saved successfully, but the latest stock could not load.');
    await expect(page.getByRole('alert').locator('..')).toHaveCSS('position', 'fixed');
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(commands).toHaveLength(1);
});
