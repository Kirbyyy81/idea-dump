'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import type { CompanionDevice } from '@/lib/types';

export function CompanionDevicesPanel() {
    const [devices, setDevices] = useState<CompanionDevice[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        fetch('/api/companion/devices').then(async response => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not load devices');
            if (active) setDevices(result.data);
        }).catch(() => { if (active) setError('Could not load companion devices'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);
    async function disconnect(id: string) {
        setBusy(id); setError('');
        try {
            const response = await fetch('/api/companion/devices/' + id, { method: 'DELETE' });
            if (!response.ok) throw new Error();
            setDevices(current => current.map(device => device.id === id ? { ...device, revoked_at: new Date().toISOString() } : device));
        } catch { setError('Could not disconnect device'); }
        finally { setBusy(null); }
    }
    return <section className="mx-auto max-w-7xl space-y-4">
        <h2 className="text-lg font-semibold">Companion devices</h2>
        {error && <p role="alert">{error}</p>}
        {loading ? <p role="status">Loading devices...</p> : !devices.length && <p>No companion connected. Start pairing from the Android app.</p>}
        {devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-default bg-bg-surface p-4">
            <div><p className="font-semibold">{device.label}</p>
                <p className="text-sm text-text-muted">{device.revoked_at ? 'Disconnected' : device.last_seen_at ? 'Last connected ' + new Date(device.last_seen_at).toLocaleString() : 'Awaiting first connection'}</p></div>
            {!device.revoked_at && <Button variant="secondary" disabled={busy !== null} isLoading={busy === device.id} onClick={() => disconnect(device.id)}>Disconnect</Button>}
        </div>)}
    </section>;
}
