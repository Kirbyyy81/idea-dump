'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Camera, Film, FolderSync, Plus, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { PageLoader } from '@/components/atoms/Loader';
import {
    FilmCamera,
    FilmDashboardSummary,
    FilmFormat,
    FilmRoll,
    FilmRollStatus,
    filmFormats,
    filmRollStatusConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type FilmDashboardCameraMetric = string | { name?: string | null; brand?: string | null; model?: string | null };

const DEFAULT_SUMMARY: FilmDashboardSummary = {
    total_pictures_taken: 0,
    total_money_spent: 0,
    total_cameras: 0,
    total_rolls: 0,
    processed_rolls: 0,
    unprocessed_rolls: 0,
    favorite_photos: 0,
    average_spend_per_roll: 0,
    maintenance_cost: 0,
    total_photos: 0,
    successful_photos: 0,
    average_cost_per_photo: 0,
    rolls_loaded_or_shooting: 0,
    latest_camera_added: null,
    cameras_with_maintenance_records: 0,
    most_used_camera: null,
};

const DEFAULT_ROLL_FORM = {
    film_name: '',
    brand: '',
    format: '35mm' as FilmFormat,
    iso: '400',
    camera_id: '',
    purchase_price: '',
    frames_taken: '',
    successful_photos: '',
    location_name: '',
    notes: '',
};

const DEFAULT_CAMERA_FORM = {
    name: '',
    brand: '',
    model: '',
    purchase_date: '',
    notes: '',
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

function formatCameraMetric(camera: FilmDashboardCameraMetric | null | undefined) {
    if (!camera) return 'None yet';
    if (typeof camera === 'string') return camera;

    const label = [camera.brand, camera.model].filter(Boolean).join(' ');
    return camera.name || label || 'Unnamed camera';
}

function getRollAccent(index: number) {
    const accents = [
        'border-accent-rose bg-[#fdf1f3]',
        'border-accent-blue bg-[#eef7f9]',
        'border-accent-sage bg-[#f2f7ed]',
        'border-accent-apricot bg-[#fff7e8]',
        'border-accent-coral bg-[#fff0ef]',
    ];
    return accents[index % accents.length];
}

export default function FilmJournalPage() {
    const [rolls, setRolls] = useState<FilmRoll[]>([]);
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [summary, setSummary] = useState<FilmDashboardSummary>(DEFAULT_SUMMARY);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingRoll, setIsSavingRoll] = useState(false);
    const [isSavingCamera, setIsSavingCamera] = useState(false);
    const [showRollForm, setShowRollForm] = useState(false);
    const [showCameraForm, setShowCameraForm] = useState(false);
    const [rollForm, setRollForm] = useState(DEFAULT_ROLL_FORM);
    const [cameraForm, setCameraForm] = useState(DEFAULT_CAMERA_FORM);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilmRollStatus | 'all'>('all');
    const [cameraFilter, setCameraFilter] = useState('');
    const [error, setError] = useState<string | null>(null);

    async function loadFilmJournal() {
        setError(null);
        try {
            const [rollsRes, camerasRes, dashboardRes] = await Promise.all([
                fetch('/api/film/rolls'),
                fetch('/api/film/cameras'),
                fetch('/api/film/dashboard'),
            ]);

            if (!rollsRes.ok) throw new Error('Failed to load film rolls');
            if (!camerasRes.ok) throw new Error('Failed to load cameras');
            if (!dashboardRes.ok) throw new Error('Failed to load dashboard summary');

            const [rollsPayload, camerasPayload, dashboardPayload] = await Promise.all([
                rollsRes.json(),
                camerasRes.json(),
                dashboardRes.json(),
            ]);

            setRolls(rollsPayload.data || []);
            setCameras(camerasPayload.data || []);
            setSummary(dashboardPayload.data || DEFAULT_SUMMARY);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load film journal');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadFilmJournal();
    }, []);

    const filteredRolls = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return rolls.filter((roll) => {
            if (statusFilter !== 'all' && roll.status !== statusFilter) return false;
            if (cameraFilter && roll.camera_id !== cameraFilter) return false;

            if (normalizedQuery) {
                const haystack = [
                    roll.film_name,
                    roll.brand,
                    roll.notes,
                    roll.location_name,
                    roll.camera?.name,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (!haystack.includes(normalizedQuery)) return false;
            }

            return true;
        });
    }, [rolls, statusFilter, cameraFilter, query]);

    const dashboardMetrics = useMemo(() => {
        const totalPhotos = summary.total_photos ?? summary.total_pictures_taken;
        const successfulPhotos = summary.successful_photos
            ?? rolls.reduce((total, roll) => total + Number(roll.successful_photos || 0), 0);
        const loadedRolls = rolls.filter((roll) => roll.status === 'LOADED').length;
        const shootingRolls = rolls.filter((roll) => roll.status === 'SHOOTING').length;
        const averageCostPerPhoto = summary.average_cost_per_photo
            ?? (successfulPhotos ? summary.total_money_spent / successfulPhotos : 0);

        return {
            totalPhotos,
            successfulPhotos,
            loadedRolls,
            shootingRolls,
            averageCostPerPhoto,
        };
    }, [rolls, summary]);

    const handleCreateCamera = async () => {
        if (!cameraForm.name.trim()) {
            setError('Camera name is required');
            return;
        }

        setIsSavingCamera(true);
        setError(null);
        try {
            const res = await fetch('/api/film/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cameraForm),
            });

            if (!res.ok) throw new Error('Failed to create camera');
            setCameraForm(DEFAULT_CAMERA_FORM);
            setShowCameraForm(false);
            await loadFilmJournal();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create camera');
        } finally {
            setIsSavingCamera(false);
        }
    };

    const handleCreateRoll = async () => {
        if (!rollForm.film_name.trim() || !rollForm.brand.trim()) {
            setError('Film name and brand are required');
            return;
        }

        setIsSavingRoll(true);
        setError(null);
        try {
            const res = await fetch('/api/film/rolls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...rollForm,
                    iso: Number(rollForm.iso),
                    purchase_price: Number(rollForm.purchase_price || 0),
                    frames_taken: Number(rollForm.frames_taken || 0),
                    successful_photos: Number(rollForm.successful_photos || 0),
                    camera_id: rollForm.camera_id || undefined,
                }),
            });

            if (!res.ok) throw new Error('Failed to create film roll');
            setRollForm(DEFAULT_ROLL_FORM);
            setShowRollForm(false);
            await loadFilmJournal();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create film roll');
        } finally {
            setIsSavingRoll(false);
        }
    };

    if (isLoading) {
        return <PageLoader message="Loading film journal..." />;
    }

    return (
        <AppShell contentClassName="p-8">
            <div className="max-w-7xl space-y-8">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-text-muted">
                            Film Photography
                        </p>
                        <h1 className="mt-1">Film Journal</h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href="/api/film/integrations/google/connect" className="btn-secondary">
                            <FolderSync size={16} className="mr-2" />
                            Connect Drive
                        </a>
                        <Button
                            variant="secondary"
                            icon={<Camera size={16} />}
                            onClick={() => setShowCameraForm((value) => !value)}
                        >
                            Add Camera
                        </Button>
                        <Button icon={<Plus size={16} />} onClick={() => setShowRollForm((value) => !value)}>
                            Add Roll
                        </Button>
                    </div>
                </header>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Total Photos</p>
                        <p className="mt-2 text-3xl font-semibold text-text-primary">{dashboardMetrics.totalPhotos}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Money Spent</p>
                        <p className="mt-2 text-3xl font-semibold text-text-primary">
                            {formatCurrency(summary.total_money_spent)}
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Cameras Owned</p>
                        <p className="mt-2 text-3xl font-semibold text-text-primary">{summary.total_cameras}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Film Rolls</p>
                        <p className="mt-2 text-3xl font-semibold text-text-primary">{summary.total_rolls}</p>
                    </Card>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Successful Photos</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">{dashboardMetrics.successfulPhotos}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Average Cost / Photo</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {formatCurrency(dashboardMetrics.averageCostPerPhoto)}
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Maintenance Cost</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {formatCurrency(summary.maintenance_cost ?? 0)}
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Loaded / Shooting</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {dashboardMetrics.loadedRolls} / {dashboardMetrics.shootingRolls}
                        </p>
                    </Card>
                    <Card className="p-5 xl:col-span-2">
                        <p className="text-sm text-text-muted">Most Used Camera</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {formatCameraMetric(summary.most_used_camera)}
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Latest Camera</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {formatCameraMetric(summary.latest_camera_added)}
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-sm text-text-muted">Maintained Cameras</p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                            {summary.cameras_with_maintenance_records ?? 0}
                        </p>
                    </Card>
                </section>

                {(showRollForm || showCameraForm) && (
                    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {showRollForm && (
                            <Card className="p-5">
                                <h2 className="text-xl">New Film Roll</h2>
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Input placeholder="Film name" value={rollForm.film_name} onChange={(event) => setRollForm({ ...rollForm, film_name: event.target.value })} />
                                    <Input placeholder="Brand" value={rollForm.brand} onChange={(event) => setRollForm({ ...rollForm, brand: event.target.value })} />
                                    <select className="input" value={rollForm.format} onChange={(event) => setRollForm({ ...rollForm, format: event.target.value as FilmFormat })}>
                                        {filmFormats.map((format) => <option key={format} value={format}>{format}</option>)}
                                    </select>
                                    <Input type="number" min="1" placeholder="ISO" value={rollForm.iso} onChange={(event) => setRollForm({ ...rollForm, iso: event.target.value })} />
                                    <select className="input" value={rollForm.camera_id} onChange={(event) => setRollForm({ ...rollForm, camera_id: event.target.value })}>
                                        <option value="">No camera selected</option>
                                        {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                                    </select>
                                    <Input type="number" min="0" step="0.01" placeholder="Purchase price" value={rollForm.purchase_price} onChange={(event) => setRollForm({ ...rollForm, purchase_price: event.target.value })} />
                                    <Input type="number" min="0" placeholder="Frames taken" value={rollForm.frames_taken} onChange={(event) => setRollForm({ ...rollForm, frames_taken: event.target.value })} />
                                    <Input type="number" min="0" placeholder="Successful photos" value={rollForm.successful_photos} onChange={(event) => setRollForm({ ...rollForm, successful_photos: event.target.value })} />
                                    <Input className="md:col-span-2" placeholder="Location" value={rollForm.location_name} onChange={(event) => setRollForm({ ...rollForm, location_name: event.target.value })} />
                                    <Textarea className="md:col-span-2" placeholder="Journal notes" value={rollForm.notes} onChange={(event) => setRollForm({ ...rollForm, notes: event.target.value })} />
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <Button onClick={handleCreateRoll} isLoading={isSavingRoll}>Save Roll</Button>
                                    <Button variant="ghost" onClick={() => setShowRollForm(false)}>Cancel</Button>
                                </div>
                            </Card>
                        )}

                        {showCameraForm && (
                            <Card className="p-5">
                                <h2 className="text-xl">New Camera</h2>
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Input placeholder="Camera name" value={cameraForm.name} onChange={(event) => setCameraForm({ ...cameraForm, name: event.target.value })} />
                                    <Input placeholder="Brand" value={cameraForm.brand} onChange={(event) => setCameraForm({ ...cameraForm, brand: event.target.value })} />
                                    <Input placeholder="Model" value={cameraForm.model} onChange={(event) => setCameraForm({ ...cameraForm, model: event.target.value })} />
                                    <Input type="date" value={cameraForm.purchase_date} onChange={(event) => setCameraForm({ ...cameraForm, purchase_date: event.target.value })} />
                                    <Textarea className="md:col-span-2" placeholder="Camera notes" value={cameraForm.notes} onChange={(event) => setCameraForm({ ...cameraForm, notes: event.target.value })} />
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <Button onClick={handleCreateCamera} isLoading={isSavingCamera}>Save Camera</Button>
                                    <Button variant="ghost" onClick={() => setShowCameraForm(false)}>Cancel</Button>
                                </div>
                            </Card>
                        )}
                    </section>
                )}

                <section className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="relative min-w-[240px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search film, camera, location, notes"
                                className="pl-9 pr-9"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                                    aria-label="Clear search"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <select className="input max-w-[220px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilmRollStatus | 'all')}>
                            <option value="all">All statuses</option>
                            {Object.entries(filmRollStatusConfig).map(([status, config]) => (
                                <option key={status} value={status}>{config.label}</option>
                            ))}
                        </select>
                        <select className="input max-w-[220px]" value={cameraFilter} onChange={(event) => setCameraFilter(event.target.value)}>
                            <option value="">All cameras</option>
                            {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                        </select>
                    </div>

                    <div className="rounded-lg border border-border-default bg-[#d9c49f] p-4 shadow-inner">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredRolls.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-dashed border-border-strong bg-bg-elevated/70 p-10 text-center">
                                    <Film className="mx-auto mb-3 text-text-muted" size={32} />
                                    <p className="text-text-secondary">No film rolls in this shelf yet.</p>
                                    <p className="mt-1 text-sm text-text-muted">Add a roll to start building the journal.</p>
                                </div>
                            ) : (
                                filteredRolls.map((roll, index) => (
                                    <Link key={roll.id} href={`/film/rolls/${roll.id}`} className="block">
                                        <article
                                            className={cn(
                                                'relative min-h-[190px] overflow-hidden rounded-lg border-2 p-4 shadow-sm transition-transform hover:-translate-y-1',
                                                getRollAccent(index)
                                            )}
                                        >
                                            <div className="absolute left-0 top-0 h-full w-3 bg-text-primary/70" />
                                            <div className="ml-3 flex h-full flex-col justify-between">
                                                <div>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{roll.brand}</p>
                                                            <h2 className="mt-1 text-2xl leading-tight">{roll.film_name}</h2>
                                                        </div>
                                                        <span className={cn('rounded-full border px-2 py-1 text-[11px]', filmRollStatusConfig[roll.status].colorClass)}>
                                                            {filmRollStatusConfig[roll.status].label}
                                                        </span>
                                                    </div>
                                                    <p className="mt-3 text-sm text-text-secondary">
                                                        {roll.format} · ISO {roll.iso}
                                                    </p>
                                                    <p className="mt-1 text-sm text-text-muted">
                                                        {roll.camera?.name || 'No camera'}{roll.location_name ? ` · ${roll.location_name}` : ''}
                                                    </p>
                                                </div>
                                                <div className="mt-6 flex items-center justify-between border-t border-text-primary/10 pt-3 text-xs text-text-secondary">
                                                    <span>{roll.frames_taken || 0} frames</span>
                                                    <span>{formatCurrency(Number(roll.purchase_price || 0))}</span>
                                                </div>
                                            </div>
                                        </article>
                                    </Link>
                                ))
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
