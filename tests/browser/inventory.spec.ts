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
        } else if (command.action === 'link_finance') {
            data.purchases.find((purchase) => purchase.id === command.payload.purchase_id)!.finance_transaction_id = command.payload.finance_transaction_id;
        }
        return route.fulfill({ json: { data: { id: resultId } } });
    });
    await page.route('**/api/inventory/expenses?*', (route) => route.fulfill({ json: { data: { expenses: [{ id: id.purchase, merchant: 'Essentials shop', amount: 180, transaction_date: '2026-10-01', currency: 'MYR' }], total: 1, page: 1 } } }));
    await page.goto('/inventory');
    return { commands, failNext: () => { failNext = true; } };
}
async function choose(page: Page, label: string, option: string) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}
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


test('receives a multi-item cart and retries with the same identity', async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Add stock', exact: true }).first().click();
    await choose(page, 'Product', 'Tissues');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    let line = page.getByRole('region', { name: 'Cart item 1' });
    await line.getByLabel('Quantity purchased').fill('2');
    await line.getByLabel('Price (RM)', { exact: true }).fill('15');
    await expect(line.getByText(/Adds 10 boxes unopened/)).toBeVisible();
    await choose(page, 'Product', 'Dove Shampoo');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    line = page.getByRole('region', { name: 'Cart item 2' });
    await line.getByLabel('Price (RM)', { exact: true }).fill('18');
    state.failNext();
    await page.getByRole('button', { name: 'Add to shelf', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary failure');
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
