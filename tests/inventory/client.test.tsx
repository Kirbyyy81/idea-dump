import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useInventoryAction } from '@/lib/inventory/core/client';
import type { InventoryMutation } from '@/lib/types';

it('submits the current form on retry without creating a request receipt', async () => {
    const saved: InventoryMutation[] = [];
    const save = vi.fn(async (command: InventoryMutation) => { saved.push(command); throw new Error('Response lost'); });
    const { result } = renderHook(() => useInventoryAction(save));
    const command = { action: 'start' as const, payload: { batch_id: '16000000-0000-4000-8000-000000000031', started_on: '2026-01-01' } };
    await act(async () => { await result.current.run(command, vi.fn()); });
    await act(async () => { await result.current.run({ ...command, payload: { ...command.payload, started_on: '2026-01-02' } }, vi.fn()); });
    expect(saved[0]).toEqual(command);
    expect(saved[0]).not.toHaveProperty('request_id');
    expect(saved[1]).not.toHaveProperty('request_id');
    expect(saved[0].payload).not.toEqual(saved[1].payload);
    expect(result.current.error).toBe('Response lost');
});
