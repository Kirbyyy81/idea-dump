import { expect, test } from '@playwright/test';
import type { FinanceSplitAllocation, FinanceTransactionDirection, FinanceTransactionSplit, FinanceTransactionView } from '@/lib/types';
import { tagTransactions, tripTag } from './finance-tags-fixture';

const paymentId = tagTransactions[0].id;
const editUrl = `/finance/transactions/split?id=${paymentId}`;
const food = { id: '40000000-0000-4000-8000-000000000001', name: 'Food', is_archived: false };
const shopping = { id: '40000000-0000-4000-8000-000000000002', name: 'Shopping', is_archived: false };
const payment: FinanceTransactionSplit['payment'] = {
    id: paymentId, amount: '34.32', currency: 'MYR', direction: 'income', party: 'Synthetic payer',
    source_name: 'Test Bank', transaction_date: '2026-09-21', reference_number: 'BANK-3432',
    category: food, notes: 'Original payment notes', tags: [tripTag],
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', route => route.fulfill({ json: {
        data: { sources: [], categories: [food, shopping], tags: [tripTag] },
    } }));
});

for (const direction of ['income', 'expense'] satisfies FinanceTransactionDirection[]) {
    test(`splits an ${direction} from the ledger and saves separate allocations`, async ({ page }) => {
        const original = { ...tagTransactions[0], amount: 34.32, direction };
        const initial = { version: '1'.repeat(32), payment: { ...payment, direction }, parts: [] };
        await page.addInitScript(({ initial, original }) => {
            Object.assign(window, { splitInitial: initial, transactionInitial: [original] });
        }, { initial, original });
        let saved: FinanceSplitAllocation[] | undefined;
        await page.route('**/api/finance/transactions/split', async route => {
            saved = route.request().postDataJSON().parts;
            await route.fulfill({ json: { success: true } });
        });

        await page.goto('/finance/transactions');
        await page.getByRole('button', { name: 'Actions for Trip cafe' }).click();
        await page.getByRole('link', { name: 'Split transaction', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Split transaction', exact: true })).toBeVisible();
        await expect(page.getByText('Reference: BANK-3432')).toBeVisible();
        await expect(page.getByText(new RegExp(`${direction} · Test Bank`, 'i'))).toBeVisible();

        const first = page.getByRole('group', { name: 'Part 1', exact: true });
        const second = page.getByRole('group', { name: 'Part 2', exact: true });
        await expect(first.getByText(tripTag.name)).toBeVisible();
        await expect(second.getByText(tripTag.name)).toBeVisible();
        await first.getByRole('textbox', { name: /Amount/ }).fill('20');
        await second.getByRole('textbox', { name: /Amount/ }).fill('14.31');
        await expect(page.getByRole('status').filter({ hasText: /Remaining to allocate: RM\s*0.01/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save split' })).toBeDisabled();

        await second.getByRole('textbox', { name: /Amount/ }).fill(direction === 'income' ? '4.32' : '14.32');
        await second.getByRole('combobox', { name: 'Category' }).click();
        await page.getByRole('option', { name: 'Shopping', exact: true }).click();
        await second.getByRole('textbox', { name: 'Payment notes' }).fill('Separate payment note');
        await second.getByRole('button', { name: 'Choose tags', exact: true }).click();
        await second.getByRole('button', { name: tripTag.name, exact: true }).click();
        await second.getByRole('heading', { name: 'Part 2' }).click();

        if (direction === 'income') {
            await page.getByRole('button', { name: 'Add part' }).click();
            const third = page.getByRole('group', { name: 'Part 3', exact: true });
            await expect(third.getByText(tripTag.name)).toBeVisible();
            await third.getByRole('textbox', { name: /Amount/ }).fill('10');
            await expect(page.getByRole('button', { name: 'Add part' })).toHaveCount(0);
        }
        await page.getByRole('button', { name: 'Save split' }).click();
        await expect(page).toHaveURL('/finance/transactions');
        const expected: FinanceSplitAllocation[] = [
            { amount: '20', category_id: food.id, notes: payment.notes, tag_ids: [tripTag.id] },
            { amount: direction === 'income' ? '4.32' : '14.32', category_id: shopping.id, notes: 'Separate payment note', tag_ids: [] },
        ];
        if (direction === 'income') expected.push({ amount: '10', category_id: null, notes: null, tag_ids: [tripTag.id] });
        expect(saved).toEqual(expected);
    });
}

test('opens shared split actions from any part, reloads a stale edit and confirms restoration', async ({ page }) => {
    const initial: FinanceTransactionSplit = { version: '1'.repeat(32), payment, parts: [
        { id: 'part-1', amount: '20', category: food, notes: 'Meal', tags: [tripTag] },
        { id: 'part-2', amount: '4.32', category: shopping, notes: null, tags: [] },
        { id: 'part-3', amount: '10', category: null, notes: null, tags: [] },
    ] };
    const entries: FinanceTransactionView[] = initial.parts.map(part => ({
        ...tagTransactions[0], id: part.id, amount: Number(part.amount), split_payment_id: paymentId,
        direction: 'income', category: part.category, notes: part.notes, tags: part.tags,
    }));
    await page.addInitScript(({ initial, entries }) => {
        Object.assign(window, { splitInitial: initial, transactionInitial: entries });
    }, { initial, entries });
    let removed: unknown;
    await page.route('**/api/finance/transactions/split**', async route => {
        if (route.request().method() === 'PUT') return route.fulfill({ status: 409, json: { error: 'The payment changed. Reload it before saving again.' } });
        if (route.request().method() === 'GET') return route.fulfill({ json: { data: { ...initial, version: '2'.repeat(32) } } });
        removed = route.request().postDataJSON();
        return route.fulfill({ json: { success: true } });
    });

    await page.goto('/finance/transactions');
    await expect(page.getByRole('link', { name: 'Split: view original payment' })).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Split: view original payment' }).first()).toHaveAttribute('href', `${editUrl}#original-payment`);
    await page.getByRole('button', { name: 'Actions for Trip cafe' }).first().click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit split', exact: true }).click();
    await page.getByRole('button', { name: 'Remove part 3' }).click();
    await expect(page.getByRole('button', { name: 'Save split' })).toBeDisabled();
    await page.getByRole('group', { name: 'Part 2', exact: true }).getByRole('textbox', { name: /Amount/ }).fill('14.32');
    await page.getByRole('button', { name: 'Save split' }).click();
    await expect(page.getByRole('alert')).toContainText('The payment changed');
    await page.getByRole('button', { name: 'Reload payment' }).click();
    await expect(page.getByRole('group', { name: 'Part 3', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove split', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove split', exact: true }).click();
    await expect(page).toHaveURL('/finance/transactions');
    expect(removed).toEqual({ id: paymentId, version: '2'.repeat(32) });
});
