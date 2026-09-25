'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';

export function PairCompanion({ code, label, account }: { code: string; label: string; account: string }) {
    const [state, setState] = useState<'ready' | 'pending' | 'done'>('ready');
    const [error, setError] = useState('');
    async function approve() {
        setState('pending'); setError('');
        try {
            const response = await fetch('/api/companion/pair/approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not connect companion');
            setState('done');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not connect companion'); setState('ready'); }
    }
    return <section className="max-w-lg space-y-5 rounded-2xl border border-border-default bg-bg-surface p-6">
        {state === 'done' ? <p role="status">Approved. Return to the companion to finish connecting.</p> : <>
            <p>Connect <strong>{label}</strong> to <strong>{account}</strong>?</p>
            <p className="font-mono text-3xl tracking-widest">{code}</p>
            <p>Check that this code matches your phone. The companion can send captured bank notifications to Finance review and read source names.</p>
            <p>You can disconnect it in Finance settings at any time.</p>
            {error && <p role="alert" className="text-error">{error}</p>}
            <Button onClick={approve} isLoading={state === 'pending'}>Connect this device</Button>
        </>}
    </section>;
}
