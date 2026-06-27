'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, FolderSync, Heart, Image as ImageIcon, Save, Star, Wrench } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { PageLoader } from '@/components/atoms/Loader';
import {
    FilmCamera,
    FilmFormat,
    FilmMaintenanceRecord,
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

const DEFAULT_MAINTENANCE_FORM = {
    service_type: 'CLA',
    maintenance_cost: '',
    service_date: '',
    provider_name: '',
    notes: '',
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

function formatDate(value: string | null | undefined) {
    if (!value) return 'No date';
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
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
    const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
    const [isAddingMaintenance, setIsAddingMaintenance] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
    const [rollForm, setRollForm] = useState<ReturnType<typeof getRollForm> | null>(null);
    const [maintenanceRecords, setMaintenanceRecords] = useState<FilmMaintenanceRecord[]>([]);
    const [maintenanceForm, setMaintenanceForm] = useState(DEFAULT_MAINTENANCE_FORM);
    const [driveFolderInput, setDriveFolderInput] = useState('');

    const loadMaintenanceRecords = useCallback(async (cameraId: string) => {
        setIsLoadingMaintenance(true);
        setMaintenanceError(null);
        try {
            const res = await fetch(`/api/film/maintenance?camera_id=${encodeURIComponent(cameraId)}`);
            if (!res.ok) throw new Error('Failed to load maintenance records');

            const payload = await res.json();
            setMaintenanceRecords(payload.data || []);
        } catch (err) {
            setMaintenanceRecords([]);
            setMaintenanceError(err instanceof Error ? err.message : 'Failed to load maintenance records');
        } finally {
            setIsLoadingMaintenance(false);
        }
    }, []);

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

    useEffect(() => {
        const cameraId = rollForm?.camera_id;
        if (!cameraId) {
            setMaintenanceRecords([]);
            setMaintenanceError(null);
            return;
        }

        loadMaintenanceRecords(cameraId);
    }, [loadMaintenanceRecords, rollForm?.camera_id]);

    const photos = useMemo(() => roll?.photos ?? [], [roll?.photos]);
    const favoritePhotos = photos.filter((photo) => photo.is_favorite);
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

    const handleAddMaintenance = async () => {
        if (!rollForm?.camera_id) {
            setMaintenanceError('Choose a camera before adding maintenance.');
            return;
        }

        setIsAddingMaintenance(true);
        setMaintenanceError(null);
        try {
            const res = await fetch('/api/film/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    camera_id: rollForm.camera_id,
                    service_type: maintenanceForm.service_type,
                    provider_name: maintenanceForm.provider_name,
                    maintenance_cost: Number(maintenanceForm.maintenance_cost || 0),
                    service_date: maintenanceForm.service_date,
                    notes: maintenanceForm.notes,
                }),
            });

            if (!res.ok) throw new Error('Failed to add maintenance record');
            setMaintenanceForm(DEFAULT_MAINTENANCE_FORM);
            await loadMaintenanceRecords(rollForm.camera_id);
        } catch (err) {
            setMaintenanceError(err instanceof Error ? err.message : 'Failed to add maintenance record');
        } finally {
            setIsAddingMaintenance(false);
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
        return <PageLoader message="Opening photobook..." />;
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
                        <p className="mt-1 text-text-secondary">
                            {roll.brand} · {roll.format} · ISO {roll.iso}
                        </p>
                    </div>
                    <Button icon={<Save size={16} />} onClick={handleSaveRoll} isLoading={isSaving}>
                        Save Photobook
                    </Button>
                </header>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Total Cost</p>
                        <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalCost)}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Frames</p>
                        <p className="mt-2 text-2xl font-semibold">{roll.frames_taken}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Cost / Frame</p>
                        <p className="mt-2 text-2xl font-semibold">{formatCurrency(costPerFrame)}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Cost / Successful Photo</p>
                        <p className="mt-2 text-2xl font-semibold">{formatCurrency(costPerSuccessfulPhoto)}</p>
                    </Card>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
                    <div className="space-y-6">
                        <Card className="p-0">
                            <div className="border-b border-border-default px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={18} className="text-accent-rose" />
                                    <h2 className="text-xl">Photobook</h2>
                                </div>
                            </div>
                            <div className="p-6">
                                {photos.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-12 text-center">
                                        <ImageIcon className="mx-auto mb-3 text-text-muted" size={34} />
                                        <p className="text-text-secondary">No synced photos yet.</p>
                                        <p className="mt-1 text-sm text-text-muted">
                                            Connect Google Drive and sync this roll&apos;s folder to fill the photobook.
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

                        {favoritePhotos.length > 0 && (
                            <Card className="p-5">
                                <h2 className="text-xl">Favorite Shots</h2>
                                <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
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
                            <h2 className="text-xl">Roll Details</h2>
                            <div className="mt-4 space-y-3">
                                <Input value={rollForm.film_name} onChange={(event) => setRollForm({ ...rollForm, film_name: event.target.value })} />
                                <Input value={rollForm.brand} onChange={(event) => setRollForm({ ...rollForm, brand: event.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <select className="input" value={rollForm.format} onChange={(event) => setRollForm({ ...rollForm, format: event.target.value as FilmFormat })}>
                                        {filmFormats.map((format) => <option key={format} value={format}>{format}</option>)}
                                    </select>
                                    <Input type="number" min="1" value={rollForm.iso} onChange={(event) => setRollForm({ ...rollForm, iso: event.target.value })} />
                                </div>
                                <select className="input" value={rollForm.status} onChange={(event) => setRollForm({ ...rollForm, status: event.target.value as FilmRollStatus })}>
                                    {Object.entries(filmRollStatusConfig).map(([status, config]) => (
                                        <option key={status} value={status}>{config.label}</option>
                                    ))}
                                </select>
                                <select className="input" value={rollForm.camera_id} onChange={(event) => setRollForm({ ...rollForm, camera_id: event.target.value })}>
                                    <option value="">No camera selected</option>
                                    {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                                </select>
                                <Input placeholder="Location" value={rollForm.location_name} onChange={(event) => setRollForm({ ...rollForm, location_name: event.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input type="number" min="0" step="0.01" value={rollForm.purchase_price} onChange={(event) => setRollForm({ ...rollForm, purchase_price: event.target.value })} />
                                    <Input type="number" min="0" value={rollForm.frames_taken} onChange={(event) => setRollForm({ ...rollForm, frames_taken: event.target.value })} />
                                </div>
                                <Input type="number" min="0" value={rollForm.successful_photos} onChange={(event) => setRollForm({ ...rollForm, successful_photos: event.target.value })} />
                                <Textarea value={rollForm.notes} onChange={(event) => setRollForm({ ...rollForm, notes: event.target.value })} placeholder="Journal notes" />
                            </div>
                        </Card>

                        <Card className="p-5">
                            <h2 className="text-xl">Google Drive Folder</h2>
                            <p className="mt-1 text-sm text-text-muted">Paste a Drive folder URL or ID for this roll.</p>
                            <div className="mt-4 space-y-3">
                                <Input value={driveFolderInput} onChange={(event) => setDriveFolderInput(event.target.value)} placeholder="Drive folder URL or ID" />
                                <div className="flex flex-wrap gap-2">
                                    <Button icon={<FolderSync size={16} />} onClick={handleSyncDrive} isLoading={isSyncing}>
                                        Sync Metadata
                                    </Button>
                                    <a href="/api/film/integrations/google/connect" className="btn-ghost">
                                        Connect
                                    </a>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-5">
                            <div className="flex items-center gap-2">
                                <Wrench size={18} className="text-accent-blue" />
                                <h2 className="text-xl">Camera Maintenance</h2>
                            </div>
                            <p className="mt-1 text-sm text-text-muted">
                                Track service history for the camera attached to this roll.
                            </p>
                            <div className="mt-4 space-y-3">
                                {!rollForm.camera_id ? (
                                    <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-4 text-sm text-text-muted">
                                        Select a camera in Roll Details to view or add maintenance records.
                                    </div>
                                ) : (
                                    <>
                                        {maintenanceError && (
                                            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                                                {maintenanceError}
                                            </div>
                                        )}
                                        {isLoadingMaintenance ? (
                                            <p className="text-sm text-text-muted">Loading maintenance records...</p>
                                        ) : maintenanceRecords.length > 0 ? (
                                            <div className="space-y-2">
                                                {maintenanceRecords.map((record) => (
                                                    <div key={record.id} className="rounded-lg border border-border-default bg-bg-hover/50 p-3 text-sm">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium capitalize text-text-primary">
                                                                    {record.service_type || 'Maintenance'}
                                                                </p>
                                                                <p className="text-text-muted">
                                                                    {[formatDate(record.service_date), record.provider_name]
                                                                        .filter(Boolean)
                                                                        .join(' · ')}
                                                                </p>
                                                            </div>
                                                            <p className="font-medium text-text-primary">
                                                                {formatCurrency(Number(record.maintenance_cost || 0))}
                                                            </p>
                                                        </div>
                                                        {record.notes && (
                                                            <p className="mt-2 text-text-secondary">{record.notes}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-4 text-sm text-text-muted">
                                                No maintenance logged for this camera yet.
                                            </div>
                                        )}
                                        <select className="input" value={maintenanceForm.service_type} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, service_type: event.target.value })}>
                                            <option value="CLA">CLA</option>
                                            <option value="Lens Cleaning">Lens Cleaning</option>
                                            <option value="Light Seal Replacement">Light Seal Replacement</option>
                                            <option value="Repair">Repair</option>
                                            <option value="Battery Replacement">Battery Replacement</option>
                                            <option value="Custom Maintenance">Custom Maintenance</option>
                                        </select>
                                        <Input placeholder="Provider or shop" value={maintenanceForm.provider_name} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, provider_name: event.target.value })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input type="number" min="0" step="0.01" placeholder="Cost" value={maintenanceForm.maintenance_cost} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, maintenance_cost: event.target.value })} />
                                            <Input type="date" value={maintenanceForm.service_date} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, service_date: event.target.value })} />
                                        </div>
                                        <Textarea placeholder="Service notes" value={maintenanceForm.notes} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, notes: event.target.value })} />
                                        <Button onClick={handleAddMaintenance} isLoading={isAddingMaintenance}>
                                            Add Maintenance
                                        </Button>
                                    </>
                                )}
                            </div>
                        </Card>

                        <Card className="p-5">
                            <h2 className="text-xl">Processing</h2>
                            <p className="mt-1 text-sm text-text-muted">
                                One processing summary belongs to this roll. Save it with the photobook.
                            </p>
                            <div className="mt-4 space-y-3">
                                <Input placeholder="Lab name" value={rollForm.lab_name} onChange={(event) => setRollForm({ ...rollForm, lab_name: event.target.value })} />
                                <div className="grid grid-cols-3 gap-2">
                                    <Input type="number" min="0" step="0.01" placeholder="Process" value={rollForm.processing_cost} onChange={(event) => setRollForm({ ...rollForm, processing_cost: event.target.value })} />
                                    <Input type="number" min="0" step="0.01" placeholder="Scan" value={rollForm.scanning_cost} onChange={(event) => setRollForm({ ...rollForm, scanning_cost: event.target.value })} />
                                    <Input type="number" min="0" step="0.01" placeholder="Ship" value={rollForm.shipping_cost} onChange={(event) => setRollForm({ ...rollForm, shipping_cost: event.target.value })} />
                                </div>
                                <Input type="date" value={rollForm.processing_date} onChange={(event) => setRollForm({ ...rollForm, processing_date: event.target.value })} />
                            </div>
                        </Card>
                    </aside>
                </section>
            </div>
        </AppShell>
    );
}
