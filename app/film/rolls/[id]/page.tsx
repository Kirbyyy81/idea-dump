'use client';

/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, FolderSync, Save } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import {
    FilmCamera,
    FilmFormat,
    FilmProcessType,
    FilmRoll,
    FilmRollStatus,
    FilmType,
    filmFormats,
    filmProcessTypeConfig,
    filmProcessTypes,
    filmRollStatusConfig,
    filmTypeConfig,
    filmTypes,
} from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { cn } from '@/lib/utils';
import { RollHeader } from './_components/RollHeader';
import { StepStepper } from './_components/StepStepper';
import { StatsCards } from './_components/StatsCards';

function getRollForm(roll: FilmRoll) {
    return {
        film_name: roll.film_name,
        brand: roll.brand,
        format: roll.format,
        film_type: roll.film_type ?? 'NEGATIVE',
        process_type: roll.process_type ?? '',
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

export default function FilmRollDetailPage() {
    return (
        <Suspense fallback={<AppShell isLoading loadingMessage="Opening film roll..." contentClassName="p-8"><div /></AppShell>}>
            <RollDetailContent />
        </Suspense>
    );
}

function RollDetailContent() {
    const params = useParams();
    const rollId = params.id as string;
    const searchParams = useSearchParams();
    const { showSuccess, showError: setAlertError } = useAlert();
    const [roll, setRoll] = useState<FilmRoll | null>(null);
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rollForm, setRollForm] = useState<ReturnType<typeof getRollForm> | null>(null);
    const [driveFolderInput, setDriveFolderInput] = useState('');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isUploadingCover, setIsUploadingCover] = useState(false);

    const loadRoll = useCallback(async () => {
        setError(null);
        try {
            const [rollRes, camerasRes] = await Promise.all([
                fetch(`/api/film/rolls/${rollId}`),
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
    }, [rollId]);

    useEffect(() => {
        loadRoll();
    }, [loadRoll]);

    const photos = useMemo(() => roll?.photos ?? [], [roll?.photos]);
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

    const steps = [
        { slug: 'film', isComplete: true },
        { slug: 'processing', isComplete: hasProcessingDetails },
        { slug: 'drive', isComplete: hasDriveFolder },
        { slug: 'photobook', isComplete: canShowPhotobook },
    ];
    const inlineSteps = steps.filter((step) => step.slug !== 'photobook');
    const defaultStep = inlineSteps.find((step) => !step.isComplete)?.slug ?? 'film';
    const stepParam = searchParams.get('step');
    const activeStep = ['film', 'processing', 'drive'].includes(stepParam || '') ? stepParam! : defaultStep;

    useEffect(() => {
        const googleStatus = searchParams.get('google');
        if (googleStatus === 'connected') showSuccess('Google Drive connected.', 'Connected');
        if (googleStatus === 'error') setAlertError('Google Drive connection failed.');
    }, [searchParams, showSuccess, setAlertError]);

    const handleCoverUpload = async () => {
        if (!roll || !coverFile) return;

        setIsUploadingCover(true);
        setError(null);
        try {
            const coverData = new FormData();
            coverData.append('cover', coverFile);
            const res = await fetch(`/api/film/rolls/${roll.id}/cover`, {
                method: 'POST',
                body: coverData,
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'Failed to upload film cover');
            setRoll(payload.data);
            setRollForm(getRollForm(payload.data));
            setCoverFile(null);
            showSuccess('Film cover updated.', 'Saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload film cover');
        } finally {
            setIsUploadingCover(false);
        }
    };

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
                    film_type: rollForm.film_type,
                    process_type: rollForm.process_type || null,
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
            showSuccess('Film roll saved.', 'Saved');
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
            showSuccess('Drive metadata synced.', 'Synced');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sync Google Drive folder');
        } finally {
            setIsSyncing(false);
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
                <RollHeader roll={roll} isSaving={isSaving} onSave={handleSaveRoll} />

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <StatsCards roll={roll} />

                <StepStepper roll={roll} photos={photos} activeStep={activeStep} rollId={roll.id} />

                {activeStep === 'film' && (
                    <aside className="space-y-6">
                        <Card className="p-5">
                            <h2 className="text-lg font-bold">Roll Details</h2>
                            <div className="mt-4 space-y-3">
                                {(roll.cover_image_url || roll.cover_photo?.thumbnail_link) && (
                                    <div className="overflow-hidden rounded-lg border border-border-default bg-bg-hover">
                                        <img
                                            src={roll.cover_image_url || roll.cover_photo?.thumbnail_link || ''}
                                            alt={`${roll.film_name} cover`}
                                            className="aspect-[4/3] w-full object-cover"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2 rounded-lg border border-border-default bg-bg-hover/40 p-3">
                                    <p className="text-sm font-semibold text-text-secondary">Cover image</p>
                                    <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} />
                                    <Button type="button" variant="secondary" onClick={handleCoverUpload} disabled={!coverFile} isLoading={isUploadingCover}>
                                        Replace Cover
                                    </Button>
                                </div>
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
                                    value={rollForm.film_type}
                                    onChange={(nextValue) => setRollForm({ ...rollForm, film_type: nextValue as FilmType })}
                                    options={filmTypes.map((type) => ({ value: type, label: filmTypeConfig[type].label }))}
                                />
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
                )}

                {activeStep === 'processing' && (
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
                            <Select
                                value={rollForm.process_type}
                                onChange={(nextValue) => setRollForm({ ...rollForm, process_type: nextValue as FilmProcessType | '' })}
                                options={[
                                    { value: '', label: 'Choose process later' },
                                    ...filmProcessTypes.map((type) => ({ value: type, label: filmProcessTypeConfig[type].label })),
                                ]}
                            />
                            <Input type="date" value={rollForm.processing_date} onChange={(event) => setRollForm({ ...rollForm, processing_date: event.target.value })} />
                            <Button icon={<Save size={16} />} onClick={handleSaveRoll} isLoading={isSaving}>
                                Save Processing
                            </Button>
                        </div>
                    </Card>
                )}

                {activeStep === 'drive' && (
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
                                <a href={`/api/film/integrations/google/connect?roll_id=${roll.id}`} className="btn-ghost">
                                    Connect Google
                                </a>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </AppShell>
    );
}
