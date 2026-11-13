import { expect, test } from '@playwright/test';
import { tagTransactions, tripTag } from './finance-tags-fixture';
import { reviewCandidates } from '../fixtures/finance-review';

const travelTag = { ...tripTag, name: 'Travel - Taiwan 2026' };
const plainTag = { ...tripTag, id: '10000000-0000-4000-8000-000000000088', name: 'Travel insurance' };
const source = { id: tagTransactions[0].source_id, name: 'Bank' };
const foreign = { foreign_amount: '1600', foreign_currency: 'TWD' };
const transaction = { ...tagTransactions[0], ...foreign, amount: 200.76, tags: [travelTag] };

test.beforeEach(async ({ page }) => {
    await page.route('**/api/finance/reference-data', route => route.fulfill({
        json: { data: { sources: [source], categories: [], tags: [travelTag, plainTag] } },
    }));
    await page.route('**/api/finance/share-batches/active', route => route.fulfill({ json: { data: null } }));
});

test('manual entry opens foreign fields only for a travel tag and saves both amounts', async ({ page }) => {
    let body: Record<string, unknown> | undefined;
    await page.route('**/api/finance/transactions', async route => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { data: transaction } });
    });
    await page.goto('/finance/add');
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    await page.getByRole('combobox', { name: 'Transaction source' }).click();
    await page.getByRole('option', { name: 'Bank', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('200.76');
    await page.getByRole('button', { name: 'Choose tags', exact: true }).click();
    await page.getByRole('button', { name: plainTag.name, exact: true }).click();
    await expect(page.getByLabel('Foreign amount', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: travelTag.name, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByLabel('Foreign currency', { exact: true }).fill('twd');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(page.getByLabel('Foreign amount', { exact: true })).toBeFocused();
    expect(body).toBeUndefined();
    await page.getByLabel('Foreign amount', { exact: true }).fill('1600.00');
    await expect(page.getByText('TWD 1,600.00 · 1 TWD = MYR 0.125475')).toBeVisible();
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect.poll(() => body).toMatchObject({ ...foreign, amount: 200.76, tag_ids: [travelTag.id, plainTag.id].sort() });
});

test('ledger shows the conversion and edit omits hidden foreign details when removing the tag', async ({ page }) => {
    let body: Record<string, unknown> | undefined;
    await page.addInitScript(rows => { Object.assign(window, { transactionInitial: rows }); }, [transaction]);
    await page.route('**/api/finance/transactions', async route => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { data: { ...transaction, tags: [] } } });
    });
    await page.goto('/finance/transactions');
    await expect(page.getByText('TWD 1,600.00 · 1 TWD = MYR 0.125475')).toBeVisible();
    await page.goto('/finance/transactions/edit?id=' + transaction.id);
    await expect(page.getByLabel('Foreign amount', { exact: true })).toHaveValue('1600');
    await page.getByRole('button', { name: 'Choose tags', exact: true }).click();
    await page.getByRole('button', { name: travelTag.name, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByLabel('Foreign amount', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => body?.tag_ids).toEqual([]);
    expect(body).not.toHaveProperty('foreign_amount');
    expect(body).not.toHaveProperty('foreign_currency');
});

test('edit explicitly clears both visible values', async ({ page }) => {
    let body: Record<string, unknown> | undefined;
    await page.addInitScript(rows => { Object.assign(window, { transactionInitial: rows }); }, [transaction]);
    await page.route('**/api/finance/transactions', async route => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { data: transaction } });
    });
    await page.goto('/finance/transactions/edit?id=' + transaction.id);
    await page.getByLabel('Foreign amount', { exact: true }).clear();
    await page.getByLabel('Foreign currency', { exact: true }).clear();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => body).toMatchObject({ foreign_amount: null, foreign_currency: null });
});

for (const intakeSource of ['notification', 'screenshot'] as const) {
    test(`review saves foreign details for a ${intakeSource}`, async ({ page }) => {
        let body: Record<string, unknown> | undefined;
        const candidate = { ...reviewCandidates[0], duplicate_transaction: null, duplicate_outcome: 'none' as const,
            duplicate_signals: [], duplicate_explanation: null,
            payload: { ...reviewCandidates[0].payload, source_id: source.id, amount: 200.76,
                duplicate_transaction_id: null, payee_name: null, ...(intakeSource === 'notification' ? foreign : {}) },
            intake: { source: intakeSource } };
        await page.addInitScript(rows => { Object.assign(window, { reviewInitial: rows }); }, [candidate]);
        await page.route('**/api/finance/review', async route => {
            body = route.request().postDataJSON();
            await route.fulfill({ json: { success: true } });
        });
        await page.goto('/finance/review');
        if (intakeSource === 'notification') {
            await expect(page.getByLabel('Foreign currency', { exact: true })).toHaveValue('TWD');
            await expect(page.getByLabel('Foreign amount', { exact: true })).toHaveValue('1600');
        } else {
            await page.getByLabel('Foreign currency', { exact: true }).fill('TWD');
            await page.getByLabel('Foreign amount', { exact: true }).fill('1600');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.getByRole('button', { name: 'Confirm transaction', exact: true }).click();
        await expect.poll(() => body).toMatchObject({ ...foreign, action: 'confirm', amount: 200.76 });
    });
}
