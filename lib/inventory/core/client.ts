'use client';
import { useRef, useState } from 'react';
import type { InventoryMutation } from '@/lib/types';

export type InventoryCommand = InventoryMutation extends infer M ? M extends InventoryMutation ? Omit<M, 'request_id'> : never : never;
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
        if (controller.signal.aborted) throw new Error('The request timed out. Retry the same action to check whether it was saved.');
        throw error;
    } finally { window.clearTimeout(timer); }
}
export function useInventoryAction(save: InventorySave) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const request = useRef<string | null>(null);
    async function run(command: InventoryCommand, done: (result: { id: string }) => void) {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError('');
        // Keep the identity after an uncertain response, even if the user edits the form.
        // A previously committed, different payload must conflict instead of adding stock again.
        request.current ??= crypto.randomUUID();
        try { done(await save({ ...command, request_id: request.current } as InventoryMutation)); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please retry.'); }
        finally { pending.current = false; setBusy(false); }
    }
    return { busy, error, run };
}
