import 'server-only';
import { financeCategoryMemorySettings } from './core/repository';
import { FinanceServiceError } from './core/errors';
import type { FinanceCategoryMemory } from '@/lib/types';

export async function categoryMemorySettings(userId: string, input: Parameters<typeof financeCategoryMemorySettings>[1]) {
    const { data, error } = await financeCategoryMemorySettings(userId, input);
    if (error) {
        if (error.code === 'P0002') throw new FinanceServiceError('Category memory not found', 404);
        if (error.code === '22023') throw new FinanceServiceError('Choose an active category', 422);
        throw new FinanceServiceError('Could not update learned categories', 503);
    }
    return data as FinanceCategoryMemory[];
}
