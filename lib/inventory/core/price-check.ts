export function priceCheckNumber(value: string) {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function checkedUnitPrice(price: string, total: string, unit: 'ml' | 'g' | 'count') {
    const amount = priceCheckNumber(price);
    const quantity = priceCheckNumber(total);
    const priceError = amount === null ? 'Enter a price of zero or more.' : undefined;
    const quantityError = quantity === null || quantity <= 0
        ? 'Enter a total greater than zero.'
        : unit === 'count' && !Number.isInteger(quantity) ? 'Enter a whole number of items.' : undefined;
    const normalized = !priceError && !quantityError ? amount! / quantity! * (unit === 'count' ? 1 : 100) : null;
    return { priceError, quantityError, normalized: normalized !== null && Number.isFinite(normalized) ? normalized : null };
}
