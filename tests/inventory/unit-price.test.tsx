import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { UnitPrice } from '@/app/inventory/_components/UnitPrice';
import { inventoryFixture, inventoryIds as id } from '../fixtures/inventory';
import type { InventoryData } from '@/lib/types';

const access = vi.hoisted(() => ({ userId: 'test-owner' }));
vi.mock('@/lib/contexts/AccessContext', () => ({ useAccess: () => access }));
const key = (owner = 'test-owner') => `inventory:unit-price-reference:${owner}:${id.shampoo}`;
const view = (data = structuredClone(inventoryFixture)) => <UnitPrice data={data} product={data.products[0]} />;
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Dove Shampoo: unit price details' }));
function choose(name: RegExp) {
    fireEvent.click(screen.getByRole('combobox', { name: 'Reference product / variant' }));
    fireEvent.click(screen.getByRole('option', { name }));
}
beforeEach(() => { localStorage.clear(); access.userId = 'test-owner'; vi.restoreAllMocks(); });

it('requires an explicit reference and keeps it across newer purchases and remounts', () => {
    const data = structuredClone(inventoryFixture);
    const rendered = render(view(data));
    expect(screen.getByText('Choose reference')).toBeTruthy();
    open();
    choose(/500 ml bottle.*2026-08-01.*15\.00/);
    expect(localStorage.getItem(key())).toBe(id.oldBatch);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/15\.00 \/ bottle/)).toBeTruthy();
    const updated: InventoryData = { ...data, purchases: [{ ...data.purchases[0], id: 'new-purchase', total_paid: 0, purchased_on: '2026-12-01', snapshot: { ...data.purchases[0].snapshot, variant_label: 'Free sample', size: 3 } }, ...data.purchases] };
    rendered.rerender(view(updated));
    expect(screen.getByText(/15\.00 \/ bottle/)).toBeTruthy();
    expect(screen.queryByText(/0\.00 \/ bottle/)).toBeNull();
    rendered.unmount();
    render(view(updated));
    expect(screen.getByText(/15\.00 \/ bottle/)).toBeTruthy();
    expect(screen.getByText(/Dove Shampoo · 500 ml bottle · 500 ml/)).toBeTruthy();
});

it('can explicitly select a free sample and preserves unknown prices', () => {
    const data = structuredClone(inventoryFixture);
    data.purchases[0].total_paid = 0;
    data.purchases[0].snapshot.variant_label = 'Free sample';
    data.purchases[0].snapshot.size = 3;
    data.purchases[1].total_paid = null;
    render(view(data));
    open();
    choose(/Free sample.*0\.00/);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/0\.00 \/ 100 ml/)).toBeTruthy();
    choose(/250 ml bottle.*Price unknown/);
    expect(within(dialog).getByText('Price unknown')).toBeTruthy();
    expect(within(dialog).queryByText(/0\.00 \/ 100 ml/)).toBeNull();
});

it('does not substitute another purchase when a saved reference disappears', () => {
    localStorage.setItem(key(), 'missing-purchase');
    render(view());
    expect(screen.getByText('Reference unavailable')).toBeTruthy();
    open();
    expect(screen.getByRole('status').textContent).toContain('Choose another reference');
    expect(localStorage.getItem(key())).toBe('missing-purchase');
    choose(/250 ml bottle.*10\.00/);
    expect(localStorage.getItem(key())).toBe(id.smallBatch);
});

it('isolates choices when the signed-in account changes', () => {
    localStorage.setItem(key(), id.oldBatch);
    const rendered = render(view());
    expect(screen.getByText(/15\.00 \/ bottle/)).toBeTruthy();
    access.userId = 'another-owner';
    rendered.rerender(view());
    expect(screen.getByText('Choose reference')).toBeTruthy();
    expect(screen.queryByText(/15\.00 \/ bottle/)).toBeNull();
});

it('reports blocked browser storage without losing the active choice', () => {
    render(view());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
    open();
    choose(/500 ml bottle.*2026-08-01.*15\.00/);
    expect(screen.getByRole('alert').textContent).toContain('could not be saved');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/15\.00 \/ bottle/)).toBeTruthy();
});
