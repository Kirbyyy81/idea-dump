'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle, FolderSync, Heart, Image as ImageIcon, Save, Star } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import {
    FilmCamera,
    FilmFormat,
    FilmPhoto,
    FilmRoll,
    FilmRollStatus,
    filmFormats,
    filmRollStatusConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';

interface RollDetailPageProps {
    params: {
        id: string;
    };
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

function getRollForm(roll: FilmRoll) {
    return {
        film_name: roll.film_name,
        brand: roll.brand,
        format: roll.format,
        iso: String(roll.iso),
        camera_id: roll.camera_id ?? '',
        status: roll.status,
        purchase_price: String(roll.purchase_price ?? 0),
        lab_name: roll.lab_name ?? '',
        processing_cost: String(roll.processing_cost ?? 0),
        scanning_cost: String(roll.scanning_cost ?? 0),
        shipping_cost: String(roll.shipping_cost ?? 0),
        processing_date: roll.processing_date ?? '',
        frames_taken: String(roll.frames_taken ?? 0),
        successful_photos: String(roll.successful_photos ?? 0),
        location_name: roll.location_name ?? '',
        notes: roll.notes ?? '',
        drive_folder_id: roll.drive_folder_id ?? '',
    };
}

export default function FilmRollDetailPage({ params }: RollDetailPageProps) {
    const [roll, setRoll] = useState<FilmRoll | null>(null);
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rollForm, setRollForm] = useState<ReturnType<typeof getRollForm> | null>(null);
    const [driveFolderInput, setDriveFolderInput] = useState('');

    const loadRoll = useCallback(async () => {
        setError(null);
        try {
            const [rollRes, camerasRes] = await Promise.all([
                fetch(`/api/film/rolls/${params.id}`),
                fetch('/api/film/cameras'),
            ]);

            if (!rollRes.ok) throw new Error('Failed to load film roll');
            if (!camerasRes.ok) throw new Error('Failed to load cameras');

            const [rollPayload, camerasPayload] = await Promise.all([
                rollRes.json(),
                camerasRes.json(),
            ]);

            setRoll(rollPayload.data);
            setRollForm(getRollForm(rollPayload.data));
            setDriveFolderInput(rollPayload.data.drive_folder_id ?? '');
            setCameras(camerasPayload.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load roll');
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        loadRoll();
    }, [loadRoll]);

    const photos = useMemo(() => roll?.photos ?? [], [roll?.photos]);
    const favoritePhotos = photos.filter((photo) => photo.is_favorite);
    const hasProcessingDetails = Boolean(
        roll?.lab_name ||
        roll?.processing_date ||
        Number(roll?.processing_cost || 0) > 0 ||
        Number(roll?.scanning_cost || 0) > 0 ||
        Number(roll?.shipping_cost || 0) > 0
    );
    const hasDriveFolder = Boolean(roll?.drive_folder_id);
    const hasSyncedPhotos = photos.length > 0;
    const canShowPhotobook = hasProcessingDetails && hasSyncedPhotos;
    const setupSteps = [
        { label: 'Add film', isComplete: true },
        { label: 'Processing', isComplete: hasProcessingDetails },
        { label: 'Drive', isComplete: hasDriveFolder },
        { label: 'Photobook', isComplete: canShowPhotobook },
    ];
    const totalCost = Number(roll?.purchase_price || 0)
        + Number(roll?.processing_cost || 0)
        + Number(roll?.scanning_cost || 0)
        + Number(roll?.shipping_cost || 0);
    const costPerFrame = roll?.frames_taken ? totalCost / roll.frames_taken : 0;
    const costPerSuccessfulPhoto = roll?.successful_photos ? totalCost / roll.successful_photos : 0;

    const handleSaveRoll = async () => {
        if (!roll || !rollForm) return;

        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/film/rolls', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: roll.id,
                    ...rollForm,
                    iso: Number(rollForm.iso),
                    purchase_price: Number(rollForm.purchase_price || 0),
                    processing_cost: Number(rollForm.processing_cost || 0),
                    scanning_cost: Number(rollForm.scanning_cost || 0),
                    shipping_cost: Number(rollForm.shipping_cost || 0),
                    frames_taken: Number(rollForm.frames_taken || 0),
                    successful_photos: Number(rollForm.successful_photos || 0),
                    camera_id: rollForm.camera_id || null,
                    drive_folder_id: rollForm.drive_folder_id || null,
                }),
            });

            if (!res.ok) throw new Error('Failed to save film roll');
            await loadRoll();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save film roll');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncDrive = async () => {
        if (!roll) return;

        setIsSyncing(true);
        setError(null);
        try {
            const res = await fetch('/api/film/integrations/google/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    film_roll_id: roll.id,
                    folder: driveFolderInput,
                }),
            });

            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'Failed to sync Google Drive folder');
            await loadRoll();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sync Google Drive folder');
        } finally {
            setIsSyncing(false);
        }
    };

    const handlePhotoUpdate = async (photo: FilmPhoto, updates: { is_favorite?: boolean; set_as_cover?: boolean }) => {
        setError(null);
        try {
            const res = await fetch('/api/film/photos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: photo.id,
                    ...updates,
                }),
            });

            if (!res.ok) throw new Error('Failed to update photo');
            await loadRoll();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update photo');
        }
    };

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening film roll..." contentClassName="p-8">
                <div />
            </AppShell>
        );
    }

    if (!roll || !rollForm) {
        return (
            <AppShell contentClassName="p-8">
                <div className="max-w-4xl">
                    <Link href="/film" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary">
                        <ArrowLeft size={18} />
                        Back to Film Journal
                    </Link>
                    <Card className="mt-6 p-10 text-center text-text-muted">
                        Film roll not found.
                    </Card>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell contentClassName="p-8">
            <div className="max-w-7xl space-y-8">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Link href="/film" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                            <ArrowLeft size={16} />
                            Back to cupboard
                        </Link>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <h1>{roll.film_name}</h1>
                            <span className={cn('rounded-full border px-3 py-1 text-xs', filmRollStatusConfig[roll.status].colorClass)}>
                                {filmRollStatusConfig[roll.status].label}
                            </span>
                        </div>
                    </div>
                    <Button icon={<Save size={16} />} onClick={handleSaveRoll} isLoading={isSaving}>
                        Save Roll
                    </Button>
                </header>

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Total Cost</p>
                        <p className="mt-2 text-2xl font-extrabold">{formatCurrency(totalCost)}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Frames</p>
                        <p className="mt-2 text-2xl font-extrabold">{roll.frames_taken}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Cost / Frame</p>
                        <p className="mt-2 text-2xl font-extrabold">{formatCurrency(costPerFrame)}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Cost / Successful Photo</p>
                        <p className="mt-2 text-2xl font-extrabold">{formatCurrency(costPerSuccessfulPhoto)}</p>
                    </Card>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {setupSteps.map((step, index) => (
                        <div
                            key={step.label}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
                                step.isComplete
                                    ? 'border-accent-sage bg-pastel-olive-soft text-text-primary'
                                    : 'border-border-default bg-bg-elevated text-text-muted'
                            )}
                        >
                            <span
                                className={cn(
                                    'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold',
                                    step.isComplete
                                        ? 'border-accent-sage bg-accent-sage text-text-primary'
                                        : 'border-border-default bg-bg-hover text-text-muted'
                                )}
                            >
                                {step.isComplete ? <CheckCircle size={14} /> : index + 1}
                            </span>
                            <span className="font-semibold">{step.label}</span>
                        </div>
                    ))}
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
                    <div className="space-y-6">
                        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-bold">Processing</h2>
                                        <p className="mt-1 text-sm text-text-muted">
                                            Complete this before opening the photobook.
                                        </p>
                                    </div>
                                    <span className={cn(
                                        'rounded-full border px-3 py-1 text-xs font-semibold',
                                        hasProcessingDetails
                                            ? 'border-accent-sage bg-pastel-olive-soft text-text-primary'
                                            : 'border-accent-apricot bg-pastel-yellow-soft text-text-primary'
                                    )}>
                                        {hasProcessingDetails ? 'Complete' : 'Needed'}
                                    </span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <Input placeholder="Lab name" value={rollForm.lab_name} onChange={(event) => setRollForm({ ...rollForm, lab_name: event.target.value })} />
                                    <div className="grid grid-cols-3 gap-2">
                                        <Input type="number" min="0" step="0.01" placeholder="Process" value={rollForm.processing_cost} onChange={(event) => setRollForm({ ...rollForm, processing_cost: event.target.value })} />
                                        <Input type="number" min="0" step="0.01" placeholder="Scan" value={rollForm.scanning_cost} onChange={(event) => setRollForm({ ...rollForm, scanning_cost: event.target.value })} />
                                        <Input type="number" min="0" step="0.01" placeholder="Ship" value={rollForm.shipping_cost} onChange={(event) => setRollForm({ ...rollForm, shipping_cost: event.target.value })} />
                                    </div>
                                    <Input type="date" value={rollForm.processing_date} onChange={(event) => setRollForm({ ...rollForm, processing_date: event.target.value })} />
                                    <Button icon={<Save size={16} />} onClick={handleSaveRoll} isLoading={isSaving}>
                                        Save Processing
                                    </Button>
                                </div>
                            </Card>

                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-bold">Google Drive</h2>
                                        <p className="mt-1 text-sm text-text-muted">
                                            Link a folder now, or come back after processing is logged.
                                        </p>
                                    </div>
                                    <span className={cn(
                                        'rounded-full border px-3 py-1 text-xs font-semibold',
                                        hasSyncedPhotos
                                            ? 'border-accent-sage bg-pastel-olive-soft text-text-primary'
                                            : hasDriveFolder
                                                ? 'border-accent-blue bg-pastel-blue-soft text-text-primary'
                                                : 'border-accent-apricot bg-pastel-yellow-soft text-text-primary'
                                    )}>
                                        {hasSyncedPhotos ? 'Synced' : hasDriveFolder ? 'Folder linked' : 'Needed'}
                                    </span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <Input value={driveFolderInput} onChange={(event) => setDriveFolderInput(event.target.value)} placeholder="Drive folder URL or ID" />
                                    <div className="flex flex-wrap gap-2">
                                        <Button icon={<FolderSync size={16} />} onClick={handleSyncDrive} isLoading={isSyncing}>
                                            Sync Metadata
                                        </Button>
                                        <a href="/api/film/integrations/google/connect" className="btn-ghost">
                                            Connect Google
                                        </a>
                                    </div>
                                </div>
                            </Card>
                        </section>

                        <Card className="p-0">
                            <div className="border-b border-border-default px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={18} className="text-accent-rose" />
                                    <h2 className="text-lg font-bold">Photobook</h2>
                                </div>
                            </div>
                            <div className="p-6">
                                {!hasProcessingDetails ? (
                                    <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-12 text-center">
                                        <ImageIcon className="mx-auto mb-3 text-text-muted" size={34} />
                                        <p className="text-text-secondary">Processing comes before the photobook.</p>
                                        <p className="mt-1 text-sm text-text-muted">
                                            Add the lab, date, or costs first. Drive setup can happen now or later.
                                        </p>
                                    </div>
                                ) : !hasSyncedPhotos ? (
                                    <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-12 text-center">
                                        <FolderSync className="mx-auto mb-3 text-text-muted" size={34} />
                                        <p className="text-text-secondary">Ready for Drive sync.</p>
                                        <p className="mt-1 text-sm text-text-muted">
                                            Processing is tracked. Link or sync the Google Drive folder to open this photobook.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {photos.map((photo) => (
                                            <article key={photo.id} className="overflow-hidden rounded-lg border border-border-default bg-bg-elevated">
                                                <a href={photo.web_view_link ?? '#'} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-bg-hover">
                                                    {photo.thumbnail_link ? (
                                                        <img
                                                            src={photo.thumbnail_link}
                                                            alt={photo.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-text-muted">
                                                            <ImageIcon size={28} />
                                                        </div>
                                                    )}
                                                </a>
                                                <div className="space-y-3 p-3">
                                                    <p className="truncate text-sm font-medium text-text-primary">{photo.name}</p>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            variant={photo.is_favorite ? 'primary' : 'secondary'}
                                                            className="h-8 px-3 text-xs"
                                                            icon={<Heart size={13} />}
                                                            onClick={() => handlePhotoUpdate(photo, { is_favorite: !photo.is_favorite })}
                                                        >
                                                            Favorite
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant={roll.cover_photo_id === photo.id ? 'primary' : 'ghost'}
                                                            className="h-8 px-3 text-xs"
                                                            icon={<Star size={13} />}
                                                            onClick={() => handlePhotoUpdate(photo, { set_as_cover: true })}
                                                        >
                                                            Cover
                                                        </Button>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>

                        {canShowPhotobook && favoritePhotos.length > 0 && (
                            <Card className="p-5">
                                <h2 className="text-lg font-bold">Favorite Shots</h2>
                                <div className="custom-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">
                                    {favoritePhotos.map((photo) => (
                                        <a key={`favorite-${photo.id}`} href={photo.web_view_link ?? '#'} target="_blank" rel="noreferrer" className="block h-28 w-36 shrink-0 overflow-hidden rounded-lg border border-border-default bg-bg-hover">
                                            {photo.thumbnail_link ? (
                                                <img src={photo.thumbnail_link} alt={photo.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-text-muted">
                                                    <ImageIcon size={24} />
                                                </div>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>

                    <aside className="space-y-6">
                        <Card className="p-5">
                            <h2 className="text-lg font-bold">Roll Details</h2>
                            <div className="mt-4 space-y-3">
                                <Input value={rollForm.film_name} onChange={(event) => setRollForm({ ...rollForm, film_name: event.target.value })} />
                                <Input value={rollForm.brand} onChange={(event) => setRollForm({ ...rollForm, brand: event.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Select
                                        value={rollForm.format}
                                        onChange={(nextValue) => setRollForm({ ...rollForm, format: nextValue as FilmFormat })}
                                        options={filmFormats.map((format) => ({ value: format, label: format }))}
                                    />
                                    <Input type="number" min="1" value={rollForm.iso} onChange={(event) => setRollForm({ ...rollForm, iso: event.target.value })} />
                                </div>
                                <Select
                                    value={rollForm.status}
                                    onChange={(nextValue) => setRollForm({ ...rollForm, status: nextValue as FilmRollStatus })}
                                    options={Object.entries(filmRollStatusConfig).map(([status, config]) => ({
                                        value: status,
                                        label: config.label,
                                    }))}
                                />
                                <Select
                                    value={rollForm.camera_id}
                                    onChange={(nextValue) => setRollForm({ ...rollForm, camera_id: nextValue })}
                                    options={[
                                        { value: '', label: 'No camera selected' },
                                        ...cameras.map((camera) => ({ value: camera.id, label: camera.name })),
                                    ]}
                                />
                                <Input placeholder="Location" value={rollForm.location_name} onChange={(event) => setRollForm({ ...rollForm, location_name: event.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input type="number" min="0" step="0.01" value={rollForm.purchase_price} onChange={(event) => setRollForm({ ...rollForm, purchase_price: event.target.value })} />
                                    <Input type="number" min="0" value={rollForm.frames_taken} onChange={(event) => setRollForm({ ...rollForm, frames_taken: event.target.value })} />
                                </div>
                                <Input type="number" min="0" value={rollForm.successful_photos} onChange={(event) => setRollForm({ ...rollForm, successful_photos: event.target.value })} />
                                <Textarea value={rollForm.notes} onChange={(event) => setRollForm({ ...rollForm, notes: event.target.value })} placeholder="Journal notes" />
                            </div>
                        </Card>
                    </aside>
                </section>
            </div>
        </AppShell>
    );
}
