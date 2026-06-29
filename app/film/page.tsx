'use client';

/* eslint-disable @next/next/no-img-element */

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

function getCanisterTheme(index: number) {
    const themes = [
        {
            shell: 'from-[#1f2933] via-[#334155] to-[#111827]',
            cap: 'from-[#0f172a] to-[#475569]',
            label: 'from-[#fef2f2] to-[#fee2e2]',
            accent: 'bg-accent-rose',
        },
        {
            shell: 'from-[#263c34] via-[#3d5f50] to-[#17241f]',
            cap: 'from-[#13221c] to-[#4f7765]',
            label: 'from-[#f2f7ed] to-[#dcebd2]',
            accent: 'bg-accent-sage',
        },
        {
            shell: 'from-[#1e3a5f] via-[#2d5f8f] to-[#12243a]',
            cap: 'from-[#102035] to-[#4378a6]',
            label: 'from-[#eef7f9] to-[#d8eef2]',
            accent: 'bg-accent-blue',
        },
        {
            shell: 'from-[#6c3f1f] via-[#a7652c] to-[#3d2413]',
            cap: 'from-[#2b170c] to-[#b97934]',
            label: 'from-[#fff7e8] to-[#ffe5b8]',
            accent: 'bg-accent-apricot',
        },
        {
            shell: 'from-[#5f2626] via-[#963f3a] to-[#341414]',
            cap: 'from-[#251010] to-[#a64b45]',
            label: 'from-[#fff0ef] to-[#ffd8d3]',
            accent: 'bg-accent-coral',
        },
    ];
    return themes[index % themes.length];
}

function FilmCoverFallback({ roll, accentClass }: { roll: FilmRoll; accentClass: string }) {
    return (
        <div className="flex h-full flex-col justify-between rounded-lg bg-[radial-gradient(circle_at_top_left,#ffffff_0,#fff8e7_45%,#ead5a5_100%)] p-3 text-[#2e2318]">
            <div>
                <div className={cn('mb-3 h-1.5 w-12 rounded-full', accentClass)} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6f5131]">{roll.brand}</p>
                <p className="mt-1 text-lg font-semibold leading-tight">{roll.film_name}</p>
            </div>
            <div className="flex items-end justify-between gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#5f452a]">
                <span>{roll.format}</span>
                <span>ISO {roll.iso}</span>
            </div>
        </div>
    );
}

function FilmCanister({ roll, index }: { roll: FilmRoll; index: number }) {
    const theme = getCanisterTheme(index);
    const thumbnail = roll.cover_photo?.thumbnail_link;

    return (
        <Link href={`/film/rolls/${roll.id}`} className="group block">
            <article className="relative mx-auto flex min-h-[360px] max-w-[250px] flex-col items-center transition-transform duration-300 group-hover:-translate-y-2">
                <div className={cn('h-8 w-[76%] rounded-t-full bg-gradient-to-b shadow-[inset_0_6px_10px_rgba(255,255,255,0.22),inset_0_-8px_16px_rgba(0,0,0,0.34)]', theme.cap)} />
                <div className={cn('relative flex min-h-[292px] w-full flex-col overflow-hidden rounded-[2.4rem] border border-white/10 bg-gradient-to-r p-4 shadow-[0_22px_32px_rgba(42,27,16,0.28),inset_18px_0_28px_rgba(255,255,255,0.10),inset_-18px_0_28px_rgba(0,0,0,0.34)]', theme.shell)}>
                    <div className="pointer-events-none absolute inset-y-0 left-7 w-8 bg-white/10 blur-md" />
                    <div className="pointer-events-none absolute inset-y-0 right-8 w-10 bg-black/20 blur-lg" />
                    <div className="relative flex items-start justify-between gap-2">
                        <span className={cn('rounded-full border px-2 py-1 text-[10px]', filmRollStatusConfig[roll.status].colorClass)}>
                            {filmRollStatusConfig[roll.status].label}
                        </span>
                        <span className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-medium text-white/85">
                            {roll.frames_taken || 0} frames
                        </span>
                    </div>
                    <div className={cn('relative mt-4 min-h-[176px] overflow-hidden rounded-2xl border border-black/20 bg-gradient-to-br p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42),0_12px_22px_rgba(0,0,0,0.22)]', theme.label)}>
                        {thumbnail ? (
                            <img
                                src={thumbnail}
                                alt={`${roll.film_name} cover`}
                                className="h-full min-h-[160px] w-full rounded-xl object-cover"
                            />
                        ) : (
                            <FilmCoverFallback roll={roll} accentClass={theme.accent} />
                        )}
                    </div>
                    <div className="relative mt-auto pt-4 text-white">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/55">{roll.brand}</p>
                        <h2 className="mt-1 line-clamp-2 text-2xl leading-tight text-white">{roll.film_name}</h2>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/75">
                            <span>{roll.format} / ISO {roll.iso}</span>
                            <span className="text-right">{formatCurrency(Number(roll.purchase_price || 0))}</span>
                            <span className="col-span-2 truncate">{roll.camera?.name || 'No camera'}{roll.location_name ? ` - ${roll.location_name}` : ''}</span>
                        </div>
                    </div>
                </div>
                <div className={cn('h-9 w-[82%] rounded-b-full bg-gradient-to-t shadow-[inset_0_8px_14px_rgba(255,255,255,0.18),inset_0_-8px_16px_rgba(0,0,0,0.34),0_10px_18px_rgba(0,0,0,0.18)]', theme.cap)} />
            </article>
        </Link>
    );
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

                    <div className="rounded-3xl border border-[#6a4d32] bg-[linear-gradient(120deg,#c5a06b,#e4cfaa_45%,#b4834d)] p-5 shadow-inner">
                        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredRolls.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-dashed border-border-strong bg-bg-elevated/70 p-10 text-center">
                                    <Film className="mx-auto mb-3 text-text-muted" size={32} />
                                    <p className="text-text-secondary">No film rolls in this shelf yet.</p>
                                    <p className="mt-1 text-sm text-text-muted">Add a roll to start building the journal.</p>
                                </div>
                            ) : (
                                filteredRolls.map((roll, index) => (
                                    <FilmCanister key={roll.id} roll={roll} index={index} />
                                ))
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
