'use client';

import { FinanceCategory } from '@/lib/types';
import { financeApiRequest } from '@/lib/finance/client';
import { getVirtualDefaultCategoryName } from '@/lib/finance/catalog';

export async function persistVirtualDefaultCategory(value: string) {
    const name = getVirtualDefaultCategoryName(value);
    if (!name) return null;

    const payload = await financeApiRequest<{ data: FinanceCategory }>('/api/finance/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'expense' }),
    }, { fallbackMessage: `Could not create the ${name} category` });

    return payload.data;
}
