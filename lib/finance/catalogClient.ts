'use client';

import { FinanceCategoryDetail } from '@/lib/types';
import { financeApiRequest } from '@/lib/finance/core/client';
import { getVirtualDefaultCategoryName } from '@/lib/finance/catalog';

export async function persistVirtualDefaultCategory(value: string) {
    const name = getVirtualDefaultCategoryName(value);
    if (!name) return null;

    const payload = await financeApiRequest<{ data: FinanceCategoryDetail }>('/api/finance/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    }, { fallbackMessage: `Could not create the ${name} category` });

    if (payload.data.is_archived) {
        throw new Error(`Restore the ${name} category in Finance settings before using it`);
    }

    return payload.data;
}
