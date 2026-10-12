'use client';
import { useRef, useState } from 'react';
import type { InventoryMutation } from '@/lib/types';

export type InventoryCommand = InventoryMutation;
export type InventorySave = (mutation: InventoryMutation) => Promise<{ id: string }>;
export async function inventoryRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not complete this action. Please retry.');
        return body.data as T;
    } catch (error) {
        if (controller.signal.aborted) throw new Error('The request timed out. Check your inventory before retrying; the save may already have completed.');
        throw error;
    } finally { window.clearTimeout(timer); }
}
export function useInventoryAction(save: InventorySave) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    async function run(command: InventoryCommand, done: (result: { id: string }) => void) {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError('');
        try { done(await save(command)); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please retry.'); }
        finally { pending.current = false; setBusy(false); }
    }
    return { busy, error, run };
}
