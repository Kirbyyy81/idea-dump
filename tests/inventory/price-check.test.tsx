import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { checkedUnitPrice } from '@/lib/inventory/core/price-check';
import { PriceCheck } from '@/app/inventory/_components/PriceCheck';
import { inventoryFixture } from '../fixtures/inventory';

afterEach(cleanup);

it.each(['', ' ', '0', '-1', 'NaN', 'Infinity', '1e999', '0x10'])('rejects invalid volume %j without inventing zero', (volume) => {
    expect(checkedUnitPrice('10', volume, 'ml').normalized).toBeNull();
});
it.each(['', ' ', '-1', 'NaN', 'Infinity', '0x10'])('rejects invalid price %j', (price) => {
    expect(checkedUnitPrice(price, '70', 'ml').normalized).toBeNull();
});
it('normalizes bundles and preserves free samples', () => {
    expect(checkedUnitPrice('38', '76', 'ml').normalized).toBe(50);
    expect(checkedUnitPrice('0', '3', 'ml').normalized).toBe(0);
    expect(checkedUnitPrice('10', '5', 'count').normalized).toBe(2);
    expect(checkedUnitPrice('10', '1.5', 'count').normalized).toBeNull();
});
it('product quantity supplies total volume and manual bundles override it until explicitly reset', () => {
    render(<PriceCheck data={inventoryFixture} />);
    const total = screen.getByLabelText(/Total volume/);
    expect((total as HTMLInputElement).value).toBe('500');
    fireEvent.change(screen.getByLabelText(/Quantity of packs/), { target: { value: '2' } });
    expect((total as HTMLInputElement).value).toBe('1000');
    fireEvent.change(total, { target: { value: '1070' } });
    fireEvent.change(screen.getByLabelText(/Total price/), { target: { value: '53.5' } });
    expect(screen.getByText('Checking').nextElementSibling?.textContent).toMatch(/5\.00/);
    fireEvent.change(screen.getByLabelText(/Quantity of packs/), { target: { value: '3' } });
    expect((total as HTMLInputElement).value).toBe('1070');
    fireEvent.change(total, { target: { value: '' } });
    expect(screen.getByText('Checking').nextElementSibling?.textContent).toBe('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Use product size and quantity' }));
    expect((total as HTMLInputElement).value).toBe('1500');
});
it('works with no saved products and reports invalid volume with zero-price samples', () => {
    render(<PriceCheck data={{ products: [], variants: [], purchases: [], usages: [], categories: [], subcategories: [] }} />);
    fireEvent.change(screen.getByLabelText(/Total volume/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Total price/), { target: { value: '0' } });
    expect(screen.getByText('Checking').nextElementSibling?.textContent).toMatch(/0\.00/);
    fireEvent.change(screen.getByLabelText(/Total volume/), { target: { value: '0' } });
    expect(screen.getByText('Checking').nextElementSibling?.textContent).toBe('Unavailable');
    expect(screen.getByText('Enter a total greater than zero.')).toBeTruthy();
});
