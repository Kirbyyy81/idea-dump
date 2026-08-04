'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FileUpload } from '@/components/molecules/FileUpload';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    FilmCamera,
    FilmFormat,
    FilmProcessType,
    FilmType,
    filmFormats,
    filmProcessTypeConfig,
    filmProcessTypes,
    filmTypeConfig,
    filmTypes,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const initialForm = {
    film_name: '',
    brand: '',
    format: '35mm' as FilmFormat,
    film_type: 'NEGATIVE' as FilmType,
    process_type: '' as FilmProcessType | '',
    iso: '400',
    frames_taken: '',
    purchase_price: '',
    camera_id: '',
    notes: '',
};

function FieldRow({
    label,
    children,
    className,
    align = 'center',
}: {
    label: string;
    children: ReactNode;
    className?: string;
    align?: 'center' | 'start';
}) {
    return (
        <label
            className={cn(
                'grid gap-2 md:grid-cols-[132px_minmax(0,1fr)]',
                align === 'start' ? 'md:items-start' : 'md:items-center',
                className
            )}
        >
            <span className={cn('text-sm text-text-secondary md:pt-0', align === 'start' && 'md:pt-2')}>
                {label}
            </span>
            {children}
        </label>
    );
}

export default function NewFilmRollPage() {
    const router = useRouter();
    const { showSuccess } = useAlert();
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [form, setForm] = useState(initialForm);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/film/cameras')
            .then((response) => response.json())
            .then((payload) => setCameras(payload.data || []))
            .catch(() => setCameras([]));
    }, []);

    async function uploadCover(rollId: string) {
        if (!coverFile) return;

        const coverData = new FormData();
        coverData.append('cover', coverFile);
        const coverResponse = await fetch(`/api/film/rolls/${rollId}/cover`, {
            method: 'POST',
            body: coverData,
        });

        if (!coverResponse.ok) {
            const coverPayload = await coverResponse.json().catch(() => ({}));
            throw new Error(coverPayload.error || 'Film roll was created, but cover upload failed');
        }
    }

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
                    status: form.camera_id ? 'SHOOTING' : 'UNUSED',
                    iso: Number(form.iso),
                    film_type: form.film_type,
                    process_type: form.process_type || null,
                    frames_taken: Number(form.frames_taken || 0),
                    purchase_price: Number(form.purchase_price || 0),
                    camera_id: form.camera_id || null,
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Failed to register film roll');

            await uploadCover(payload.data.id);
            showSuccess('Film roll registered.', 'Saved');
            router.push(`/film/rolls/${payload.data.id}`);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Failed to register film roll');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <AppShell pageTitle="Register a Film Roll" contentClassName="film-module p-5 md:p-8">
            <div className="mx-auto max-w-5xl space-y-7">
                {error && <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <Card className="overflow-hidden p-0">
                        <div className="border-b border-border-default bg-bg-hover/50 px-6 py-5">
                            <div className="flex items-center gap-3">
                                <PackagePlus className="text-accent-apricot" size={22} />
                                <div>
                                    <h2 className="text-lg font-bold">Unopened roll</h2>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 md:grid-cols-2">
                            <FieldRow label="Film name *">
                                <Input required value={form.film_name} onChange={(event) => setForm({ ...form, film_name: event.target.value })} />
                            </FieldRow>
                            <FieldRow label="Brand *">
                                <Input required value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
                            </FieldRow>
                            <FieldRow label="Format *">
                                <Select value={form.format} onChange={(nextValue) => setForm({ ...form, format: nextValue as FilmFormat })} options={filmFormats.map((format) => ({ value: format, label: format }))} />
                            </FieldRow>
                            <FieldRow label="Film type *">
                                <Select value={form.film_type} onChange={(nextValue) => setForm({ ...form, film_type: nextValue as FilmType })} options={filmTypes.map((type) => ({ value: type, label: filmTypeConfig[type].label }))} />
                            </FieldRow>
                            <FieldRow label="Process type">
                                <Select value={form.process_type} onChange={(nextValue) => setForm({ ...form, process_type: nextValue as FilmProcessType | '' })} options={[{ value: '', label: 'Processing only' }, ...filmProcessTypes.map((type) => ({ value: type, label: filmProcessTypeConfig[type].label }))]} />
                            </FieldRow>
                            <FieldRow label="ISO *">
                                <Input required type="number" min="1" value={form.iso} onChange={(event) => setForm({ ...form, iso: event.target.value })} />
                            </FieldRow>
                            <FieldRow label="Frames taken">
                                <Input type="number" min="0" value={form.frames_taken} onChange={(event) => setForm({ ...form, frames_taken: event.target.value })} />
                            </FieldRow>
                            <FieldRow label="Purchase price">
                                <Input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(event) => setForm({ ...form, purchase_price: event.target.value })} />
                            </FieldRow>
                            <FieldRow label="Camera">
                                <Select value={form.camera_id} onChange={(nextValue) => setForm({ ...form, camera_id: nextValue })} options={[{ value: '', label: 'Assign later' }, ...cameras.map((camera) => ({ value: camera.id, label: camera.name }))]} />
                            </FieldRow>
                            <div className="md:col-span-2">
                                <FileUpload
                                    label="Cover image"
                                    accept="image/jpeg,image/png,image/webp"
                                    value={coverFile}
                                    onChange={setCoverFile}
                                />
                            </div>
                            <FieldRow label="Purchase notes" className="md:col-span-2" align="start">
                                <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                            </FieldRow>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border-default px-6 py-4">
                            <Button type="button" variant="ghost" onClick={() => router.push('/film')}>Cancel</Button>
                            <Button type="submit" isLoading={isSaving}>Place on Shelf</Button>
                        </div>
                    </Card>
                </form>
            </div>
        </AppShell>
    );
}
