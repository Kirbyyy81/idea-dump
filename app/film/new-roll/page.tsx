'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FilmCamera, FilmFormat, filmFormats } from '@/lib/types';

const initialForm = { film_name: '', brand: '', format: '35mm' as FilmFormat, iso: '400', purchase_price: '', camera_id: '', notes: '' };

export default function NewFilmRollPage() {
    const router = useRouter();
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [form, setForm] = useState(initialForm);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/film/cameras').then((response) => response.json()).then((payload) => setCameras(payload.data || [])).catch(() => setCameras([]));
    }, []);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const response = await fetch('/api/film/rolls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    status: 'UNUSED',
                    iso: Number(form.iso),
                    purchase_price: Number(form.purchase_price || 0),
                    camera_id: form.camera_id || null,
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Failed to register film roll');
            router.push(`/film/rolls/${payload.data.id}`);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Failed to register film roll');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-5xl space-y-7">
                <header className="space-y-5">
                    <div><p className="text-sm uppercase tracking-[0.22em] text-text-muted">Inventory</p><h1 className="mt-1">Register a Film Roll</h1></div>
                </header>
                {error && <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <Card className="overflow-hidden p-0">
                        <div className="border-b border-border-default bg-bg-hover/50 px-6 py-5"><div className="flex items-center gap-3"><PackagePlus className="text-accent-apricot" size={22} /><div><h2 className="text-xl">Unopened roll</h2><p className="text-sm text-text-muted">It will begin on your shelf with the Unused status.</p></div></div></div>
                        <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
                            <label className="space-y-2"><span className="text-sm text-text-secondary">Film name *</span><Input required value={form.film_name} onChange={(event) => setForm({ ...form, film_name: event.target.value })} placeholder="Portra 400" /></label>
                            <label className="space-y-2"><span className="text-sm text-text-secondary">Brand *</span><Input required value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="Kodak" /></label>
                            <label className="space-y-2"><span className="text-sm text-text-secondary">Format *</span><Select value={form.format} onChange={(nextValue) => setForm({ ...form, format: nextValue as FilmFormat })} options={filmFormats.map((format) => ({ value: format, label: format }))} /></label>
                            <label className="space-y-2"><span className="text-sm text-text-secondary">ISO *</span><Input required type="number" min="1" value={form.iso} onChange={(event) => setForm({ ...form, iso: event.target.value })} /></label>
                            <label className="space-y-2"><span className="text-sm text-text-secondary">Purchase price</span><Input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(event) => setForm({ ...form, purchase_price: event.target.value })} placeholder="0.00" /></label>
                            <label className="space-y-2"><span className="text-sm text-text-secondary">Camera (optional)</span><Select value={form.camera_id} onChange={(nextValue) => setForm({ ...form, camera_id: nextValue })} options={[{ value: '', label: 'Assign later' }, ...cameras.map((camera) => ({ value: camera.id, label: camera.name }))]} /></label>
                            <label className="space-y-2 md:col-span-2"><span className="text-sm text-text-secondary">Purchase notes</span><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Where you bought it, expiry, storage notes..." /></label>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border-default px-6 py-4"><Button type="button" variant="ghost" onClick={() => router.push('/film')}>Cancel</Button><Button type="submit" isLoading={isSaving}>Place on Shelf</Button></div>
                    </Card>
                </form>
            </div>
        </AppShell>
    );
}
