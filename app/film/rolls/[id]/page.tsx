'use client';

/* eslint-disable @next/next/no-img-element */

import { ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, FolderSync, Heart, ImageIcon, Save, Star, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { DatePicker } from '@/components/atoms/DatePicker';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FileUpload } from '@/components/molecules/FileUpload';
import {
    FilmCamera,
    FilmFormat,
    FilmPhoto,
    FilmProcessType,
    FilmRoll,
    FilmType,
    filmFormats,
    filmProcessTypeConfig,
    filmProcessTypes,
    filmTypeConfig,
    filmTypes,
} from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { cn } from '@/lib/utils';
import {
    getNextFilmRollStep,
    getOpeningFilmRollStep,
    getStatusAfterSavingFilmRollStep,
    isFilmRollStep,
} from '@/lib/film/workflow';
import { RollHeader } from './_components/RollHeader';
import { StepStepper } from './_components/StepStepper';
import { StatsCards } from './_components/StatsCards';

function getTodayInputDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getOptionalMoneyFormValue(value: number | null | undefined) {
    return Number(value || 0) > 0 ? String(value) : '';
}

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
        processing_cost: getOptionalMoneyFormValue(roll.processing_cost),
        scanning_cost: getOptionalMoneyFormValue(roll.scanning_cost),
        shipping_cost: getOptionalMoneyFormValue(roll.shipping_cost),
        processing_date: roll.processing_date ?? getTodayInputDate(),
        frames_taken: String(roll.frames_taken ?? 0),
        successful_photos: String(roll.successful_photos ?? 0),
        location_name: roll.location_name ?? '',
        notes: roll.notes ?? '',
        drive_folder_id: roll.drive_folder_id ?? '',
    };
}

function getPhotoImageUrl(photo: Pick<FilmPhoto, 'id'>) {
    return `/api/film/photos/${photo.id}/image`;
}

export default function FilmRollDetailPage() {
    return (
        <Suspense fallback={<AppShell isLoading loadingMessage="Opening film roll..." contentClassName="p-5 md:p-8"><div /></AppShell>}>
            <RollDetailContent />
        </Suspense>
    );
}

function RollDetailContent() {
    const params = useParams();
    const rollId = params.id as string;
    const router = useRouter();
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
    const [selectedPhoto, setSelectedPhoto] = useState<FilmPhoto | null>(null);
    const [updatingPhotoId, setUpdatingPhotoId] = useState<string | null>(null);

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
    const hasDriveFolder = Boolean(roll?.drive_folder_id);
    const hasSyncedPhotos = photos.length > 0;
    const defaultStep = getOpeningFilmRollStep(roll?.status ?? 'UNUSED', hasSyncedPhotos);
    const stepParam = searchParams.get('step');
    const activeStep = isFilmRollStep(stepParam) ? stepParam : defaultStep;

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

    const handleUpdatePhoto = async (
        photo: FilmPhoto,
        updates: { is_favorite?: boolean; set_as_cover?: boolean }
    ) => {
        if (!roll) return;

        setUpdatingPhotoId(photo.id);
        setError(null);
        try {
            const res = await fetch('/api/film/photos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: photo.id,
                    film_roll_id: roll.id,
                    ...updates,
                }),
            });

            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'Failed to update photo');

            await loadRoll();
            setSelectedPhoto((current) => current && current.id === photo.id
                ? { ...current, ...payload.data }
                : current);
            showSuccess(updates.set_as_cover ? 'Cover photo updated.' : 'Photo updated.', 'Saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update photo');
        } finally {
            setUpdatingPhotoId(null);
        }
    };

    const handleSaveRoll = async () => {
        if (!roll || !rollForm) return;

        setIsSaving(true);
        setError(null);
        try {
            const nextStatus = getStatusAfterSavingFilmRollStep(activeStep, roll.status);
            const nextStep = getNextFilmRollStep(activeStep);
            const res = await fetch('/api/film/rolls', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: roll.id,
                    ...rollForm,
                    status: nextStatus,
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
            router.replace(`/film/rolls/${roll.id}?step=${nextStep}`);
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
            if (Number(payload.data?.synced_count || 0) > 0) {
                router.replace(`/film/rolls/${roll.id}?step=photobook`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sync Google Drive folder');
        } finally {
            setIsSyncing(false);
        }
    };

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening film roll..." contentClassName="film-module p-5 md:p-8">
                <div />
            </AppShell>
        );
    }

    if (!roll || !rollForm) {
        return (
            <AppShell contentClassName="film-module p-5 md:p-8">
                <div className="max-w-4xl">
                    <Link href="/film" className="action-link inline-flex items-center gap-2 text-text-secondary hover:text-text-primary">
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
        <AppShell contentClassName="film-module p-5 md:p-8">
            <div className="max-w-7xl space-y-8">
                <RollHeader
                    roll={roll}
                    isSaving={isSaving}
                    onSave={handleSaveRoll}
                    showSave={activeStep === 'film'}
                    saveLabel="Save & Continue"
                    alternateAction={activeStep === 'photobook' ? (
                        <Link href={`/film/rolls/${roll.id}?step=film`} className="btn-secondary min-h-8 self-start px-3 py-1.5 text-xs">
                            Roll Details
                        </Link>
                    ) : undefined}
                />

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                {activeStep !== 'photobook' && <StatsCards roll={roll} />}

                <StepStepper roll={roll} photos={photos} activeStep={activeStep} rollId={roll.id} />

                {activeStep === 'film' && (
                    <aside className="space-y-6">
                        <Card className="p-5">
                            <h2 className="text-lg font-bold">Roll Details</h2>
                            <div className="mt-4 space-y-3">
                                {(roll.cover_image_url || roll.cover_photo?.thumbnail_link) && (
                                    <div className="overflow-hidden rounded-lg border border-border-default bg-bg-hover">
                                        <img
                                            src={roll.cover_image_url || (roll.cover_photo ? getPhotoImageUrl(roll.cover_photo) : '')}
                                            alt={`${roll.film_name} cover`}
                                            className="aspect-[4/3] w-full object-cover"
                                        />
                                    </div>
                                )}
                                <div className="space-y-3 rounded-lg border border-border-default bg-bg-hover/40 p-3">
                                    <FileUpload
                                        label="Cover image"
                                        accept="image/jpeg,image/png,image/webp"
                                        value={coverFile}
                                        onChange={setCoverFile}
                                        previewUrl={roll.cover_image_url || (roll.cover_photo ? getPhotoImageUrl(roll.cover_photo) : undefined)}
                                        disabled={isUploadingCover}
                                    />
                                    <Button type="button" variant="secondary" onClick={handleCoverUpload} disabled={!coverFile} isLoading={isUploadingCover} className="w-full sm:w-auto">
                                        Replace Cover
                                    </Button>
                                </div>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Film name</span>
                                    <Input value={rollForm.film_name} onChange={(event) => setRollForm({ ...rollForm, film_name: event.target.value })} />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Brand</span>
                                    <Input value={rollForm.brand} onChange={(event) => setRollForm({ ...rollForm, brand: event.target.value })} />
                                </label>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Format</span>
                                        <Select
                                            value={rollForm.format}
                                            onChange={(nextValue) => setRollForm({ ...rollForm, format: nextValue as FilmFormat })}
                                            options={filmFormats.map((format) => ({ value: format, label: format }))}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">ISO</span>
                                        <Input type="number" min="1" value={rollForm.iso} onChange={(event) => setRollForm({ ...rollForm, iso: event.target.value })} />
                                    </label>
                                </div>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Film type</span>
                                    <Select
                                        value={rollForm.film_type}
                                        onChange={(nextValue) => setRollForm({ ...rollForm, film_type: nextValue as FilmType })}
                                        options={filmTypes.map((type) => ({ value: type, label: filmTypeConfig[type].label }))}
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Camera</span>
                                    <Select
                                        value={rollForm.camera_id}
                                        onChange={(nextValue) => setRollForm({ ...rollForm, camera_id: nextValue })}
                                        options={[
                                            { value: '', label: 'No camera selected' },
                                            ...cameras.map((camera) => ({ value: camera.id, label: camera.name })),
                                        ]}
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Location</span>
                                    <Input value={rollForm.location_name} onChange={(event) => setRollForm({ ...rollForm, location_name: event.target.value })} />
                                </label>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Purchase price</span>
                                        <Input type="number" min="0" step="0.01" value={rollForm.purchase_price} onChange={(event) => setRollForm({ ...rollForm, purchase_price: event.target.value })} />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Frames taken</span>
                                        <Input type="number" min="0" value={rollForm.frames_taken} onChange={(event) => setRollForm({ ...rollForm, frames_taken: event.target.value })} />
                                    </label>
                                </div>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Successful photos</span>
                                    <Input type="number" min="0" value={rollForm.successful_photos} onChange={(event) => setRollForm({ ...rollForm, successful_photos: event.target.value })} />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Journal notes</span>
                                    <Textarea value={rollForm.notes} onChange={(event) => setRollForm({ ...rollForm, notes: event.target.value })} />
                                </label>
                            </div>
                        </Card>
                    </aside>
                )}

                {activeStep === 'processing' && (
                    <Card className="p-5">
                        <div>
                            <h2 className="text-lg font-bold">Processing</h2>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Input value={rollForm.lab_name} onChange={(event) => setRollForm({ ...rollForm, lab_name: event.target.value })} />
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Processing cost</span>
                                    <Input type="number" min="0" step="0.01" value={rollForm.processing_cost} onChange={(event) => setRollForm({ ...rollForm, processing_cost: event.target.value })} />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Scanning cost</span>
                                    <Input type="number" min="0" step="0.01" value={rollForm.scanning_cost} onChange={(event) => setRollForm({ ...rollForm, scanning_cost: event.target.value })} />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm text-text-secondary">Shipping cost</span>
                                    <Input type="number" min="0" step="0.01" value={rollForm.shipping_cost} onChange={(event) => setRollForm({ ...rollForm, shipping_cost: event.target.value })} />
                                </label>
                            </div>
                            <Select
                                value={rollForm.process_type}
                                onChange={(nextValue) => setRollForm({ ...rollForm, process_type: nextValue as FilmProcessType | '' })}
                                options={[
                                    { value: '', label: 'Processing Type' },
                                    ...filmProcessTypes.map((type) => ({ value: type, label: filmProcessTypeConfig[type].label })),
                                ]}
                            />
                            <DatePicker
                                value={rollForm.processing_date}
                                onChange={(nextValue) => setRollForm({ ...rollForm, processing_date: nextValue })}
                                ariaLabel="Processing date"
                            />
                            <Button icon={<Save size={16} />} onClick={handleSaveRoll} isLoading={isSaving} className="w-full sm:w-auto">
                                Save & Continue
                            </Button>
                        </div>
                    </Card>
                )}

                {activeStep === 'drive' && (
                    <Card className="p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div>
                                <h2 className="text-lg font-bold">Google Drive</h2>
                            </div>
                            <span className={cn(
                                'rounded-full border px-3 py-1 text-xs font-semibold',
                                hasSyncedPhotos
                                    ? 'border-accent-sage bg-pastel-olive-soft text-text-primary'
                                    : hasDriveFolder
                                        ? 'border-accent-blue bg-pastel-blue-soft text-text-primary'
                                        : 'border-accent-apricot bg-pastel-yellow-soft text-text-primary'
                            )}>
                                {hasSyncedPhotos ? 'Synced' : hasDriveFolder ? 'Linked' : 'Needed'}
                            </span>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Input value={driveFolderInput} onChange={(event) => setDriveFolderInput(event.target.value)} />
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                <Button icon={<FolderSync size={16} />} onClick={handleSyncDrive} isLoading={isSyncing} className="w-full sm:w-auto">
                                    Sync & Continue
                                </Button>
                                <a href={`/api/film/integrations/google/connect?roll_id=${roll.id}`} className="btn-ghost w-full sm:w-auto">
                                    Connect Google
                                </a>
                            </div>
                        </div>
                    </Card>
                )}

                {activeStep === 'photobook' && (
                    <PhotobookContactSheet
                        roll={roll}
                        photos={photos}
                        isUpdatingPhotoId={updatingPhotoId}
                        onSelectPhoto={setSelectedPhoto}
                        onToggleFavorite={(photo) => handleUpdatePhoto(photo, { is_favorite: !photo.is_favorite })}
                        onSetCover={(photo) => handleUpdatePhoto(photo, { set_as_cover: true })}
                    />
                )}

                {selectedPhoto && (
                    <PhotoPreviewDialog
                        roll={roll}
                        photo={selectedPhoto}
                        isUpdating={updatingPhotoId === selectedPhoto.id}
                        onClose={() => setSelectedPhoto(null)}
                        onToggleFavorite={() => handleUpdatePhoto(selectedPhoto, { is_favorite: !selectedPhoto.is_favorite })}
                        onSetCover={() => handleUpdatePhoto(selectedPhoto, { set_as_cover: true })}
                    />
                )}
            </div>
        </AppShell>
    );
}

function chunkPhotos(photos: FilmPhoto[], size: number) {
    const chunks: FilmPhoto[][] = [];
    for (let index = 0; index < photos.length; index += size) {
        chunks.push(photos.slice(index, index + size));
    }
    return chunks.length > 0 ? chunks : [[]];
}

function PhotobookContactSheet({
    roll,
    photos,
    isUpdatingPhotoId,
    onSelectPhoto,
    onToggleFavorite,
    onSetCover,
}: {
    roll: FilmRoll;
    photos: FilmPhoto[];
    isUpdatingPhotoId: string | null;
    onSelectPhoto: (photo: FilmPhoto) => void;
    onToggleFavorite: (photo: FilmPhoto) => void;
    onSetCover: (photo: FilmPhoto) => void;
}) {
    const rows = chunkPhotos(photos, 6);
    const placeholderCount = photos.length === 0 ? 6 : Math.max(0, 6 - rows[rows.length - 1].length);

    return (
        <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border-default bg-bg-elevated p-5">
                <h2 className="text-xl font-bold sm:text-2xl">Contact Sheet</h2>
                <Link href={`/film/rolls/${roll.id}?step=drive`} className="btn-ghost min-h-8 shrink-0 px-2.5 py-1 text-xs">
                    Manage Drive
                </Link>
            </div>

            <div className="bg-[#f8f3e7] p-2 sm:p-4">
                <div className="space-y-3 rounded-sm bg-[#171310] p-2 shadow-subtle">
                    {rows.map((row, rowIndex) => {
                        const placeholders = rowIndex === rows.length - 1 ? placeholderCount : 0;
                        return (
                            <FilmStripRow key={`${rowIndex}-${row.length}`}>
                                {row.map((photo) => (
                                    <FilmFrame
                                        key={photo.id}
                                        roll={roll}
                                        photo={photo}
                                        isUpdating={isUpdatingPhotoId === photo.id}
                                        onSelect={() => onSelectPhoto(photo)}
                                        onToggleFavorite={() => onToggleFavorite(photo)}
                                        onSetCover={() => onSetCover(photo)}
                                    />
                                ))}
                                {Array.from({ length: placeholders }).map((_, index) => (
                                    <EmptyFilmFrame key={`placeholder-${rowIndex}-${index}`} />
                                ))}
                            </FilmStripRow>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}

function FilmStripRow({ children }: { children: ReactNode }) {
    return (
        <div className="bg-[#1f1915] p-1">
            <div className="h-3 rounded-[2px] bg-[repeating-linear-gradient(90deg,#f8f3e7_0_5px,transparent_5px_12px)]" />
            <div className="grid grid-cols-2 gap-1 bg-[#120f0d] py-1 sm:grid-cols-3 lg:grid-cols-6">
                {children}
            </div>
            <div className="h-3 rounded-[2px] bg-[repeating-linear-gradient(90deg,#f8f3e7_0_5px,transparent_5px_12px)]" />
        </div>
    );
}

function FilmFrame({
    roll,
    photo,
    isUpdating,
    onSelect,
    onToggleFavorite,
    onSetCover,
}: {
    roll: FilmRoll;
    photo: FilmPhoto;
    isUpdating: boolean;
    onSelect: () => void;
    onToggleFavorite: () => void;
    onSetCover: () => void;
}) {
    const isCover = roll.cover_photo_id === photo.id;

    return (
        <div className="group relative aspect-[4/3] overflow-hidden bg-black">
            <button type="button" onClick={onSelect} className="h-full w-full text-left">
                {photo.thumbnail_link ? (
                    <img src={getPhotoImageUrl(photo)} alt={photo.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                    <div className="grid h-full place-items-center p-3 text-center text-xs text-on-dark/70">
                        <ImageIcon size={22} className="mx-auto mb-2" />
                        <span className="line-clamp-2">{photo.name}</span>
                    </div>
                )}
            </button>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                <button
                    type="button"
                    onClick={onToggleFavorite}
                    disabled={isUpdating}
                    className={cn('rounded-full bg-bg-elevated/90 p-1.5 text-text-primary shadow-subtle', photo.is_favorite && 'text-error')}
                    aria-label={photo.is_favorite ? 'Remove favorite' : 'Mark favorite'}
                >
                    <Heart size={14} fill={photo.is_favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                    type="button"
                    onClick={onSetCover}
                    disabled={isUpdating || isCover}
                    className={cn('rounded-full bg-bg-elevated/90 p-1.5 text-text-primary shadow-subtle', isCover && 'text-accent-apricot')}
                    aria-label={isCover ? 'Current cover photo' : 'Set as cover photo'}
                >
                    <Star size={14} fill={isCover ? 'currentColor' : 'none'} />
                </button>
            </div>
        </div>
    );
}

function EmptyFilmFrame() {
    return (
        <div className="aspect-[4/3] border border-[#2f2925] bg-black/95" />
    );
}

function PhotoPreviewDialog({
    roll,
    photo,
    isUpdating,
    onClose,
    onToggleFavorite,
    onSetCover,
}: {
    roll: FilmRoll;
    photo: FilmPhoto;
    isUpdating: boolean;
    onClose: () => void;
    onToggleFavorite: () => void;
    onSetCover: () => void;
}) {
    const isCover = roll.cover_photo_id === photo.id;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-overlay-backdrop" onClick={onClose} aria-label="Close photo preview" />
            <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-border-default bg-bg-elevated shadow-subtle">
                <div className="flex items-center justify-between gap-3 border-b border-border-default p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold">{photo.name}</h2>
                        <p className="text-sm text-text-muted">
                            {[photo.width && photo.height ? `${photo.width} x ${photo.height}` : null, photo.mime_type].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-text-muted hover:bg-bg-hover hover:text-text-primary" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="grid gap-0 md:grid-cols-[1fr_260px]">
                    <div className="grid min-h-[320px] place-items-center bg-[#120f0d] p-4">
                        {photo.thumbnail_link ? (
                            <img src={getPhotoImageUrl(photo)} alt={photo.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
                        ) : (
                            <div className="text-center text-on-dark/70">
                                <ImageIcon size={36} className="mx-auto mb-3" />
                                <p>No thumbnail.</p>
                            </div>
                        )}
                    </div>
                    <aside className="space-y-3 border-t border-border-default p-4 md:border-l md:border-t-0">
                        <Button type="button" variant="secondary" icon={<Heart size={16} />} onClick={onToggleFavorite} disabled={isUpdating} className="w-full">
                            {photo.is_favorite ? 'Remove Favorite' : 'Mark Favorite'}
                        </Button>
                        <Button type="button" variant="secondary" icon={<Star size={16} />} onClick={onSetCover} disabled={isUpdating || isCover} className="w-full">
                            {isCover ? 'Current Cover' : 'Set as Cover'}
                        </Button>
                        {photo.web_view_link && (
                            <a href={photo.web_view_link} target="_blank" rel="noreferrer" className="btn-ghost inline-flex w-full items-center justify-center gap-2">
                                <ExternalLink size={16} />
                                Open in Drive
                            </a>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}
