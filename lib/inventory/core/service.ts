import 'server-only';
import type { InventoryData, InventoryExpense, InventoryMutation } from '@/lib/types';
import { InventoryError } from './validation';
import { readInventory, readInventoryExpenses, writeInventory } from './repository';

function databaseError(error: { code?: string }): never {
    if (error.code === '42501') throw new InventoryError('You do not have access to this inventory action.', 403);
    if (error.code === 'P0002') throw new InventoryError('This item is no longer available.', 404);
    if (['40001', '23505', '40P01'].includes(error.code ?? '')) throw new InventoryError('These records changed. Refresh and check your entries before trying again.', 409);
    if (['22023', '23514', '23503', '22P02', '22003', '22008'].includes(error.code ?? '')) throw new InventoryError('Check the quantities, dates, and selected items against your current stock.', 422);
    console.error('Inventory database operation failed', { code: error.code ?? 'unknown' });
    throw new InventoryError('Could not load or save inventory. Please retry.', 500);
}
export async function getInventory(userId: string): Promise<InventoryData> {
    const { data, error } = await readInventory(userId);
    if (error) databaseError(error);
    return data as InventoryData;
}
export async function mutateInventory(userId: string, mutation: InventoryMutation): Promise<{ id: string }> {
    const { data, error } = await writeInventory(userId, mutation);
    if (error) databaseError(error);
    return data as { id: string };
}
export async function getInventoryExpenses(userId: string, query: string, page: number) {
    const { data, error, count } = await readInventoryExpenses(userId, query, page);
    if (error) databaseError(error);
    return { expenses: data as InventoryExpense[], total: count ?? 0, page };
}
