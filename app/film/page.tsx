'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Film, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { PageLoader } from '@/components/atoms/Loader';
import { FilmCamera, FilmRoll, FilmRollStatus, filmRollStatusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

const CANISTER_THEMES = [
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

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

function FilmCoverFallback({ roll, accentClass }: { roll: FilmRoll; accentClass: string }) {
    return (
        <div className="flex h-full flex-col justify-between rounded-lg bg-[radial-gradient(circle_at_top_left,#ffffff_0,#fff8e7_45%,#ead5a5_100%)] p-3 text-[#2e2318]">
            <div>
                <div className={cn('mb-3 h-1.5 w-12 rounded-full', accentClass)} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6f5131]">
                    {roll.brand}
                </p>
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
    const theme = CANISTER_THEMES[index % CANISTER_THEMES.length];
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
                            <span className="col-span-2 truncate">
                                {roll.camera?.name || 'No camera'}{roll.location_name ? ` - ${roll.location_name}` : ''}
                            </span>
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
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<FilmRollStatus | 'all'>('all');
    const [cameraId, setCameraId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadShelf() {
            try {
                const [rollsResponse, camerasResponse] = await Promise.all([
                    fetch('/api/film/rolls'),
                    fetch('/api/film/cameras'),
                ]);
                if (!rollsResponse.ok || !camerasResponse.ok) throw new Error('Failed to load film shelf');
                const [rollPayload, cameraPayload] = await Promise.all([
                    rollsResponse.json(),
                    camerasResponse.json(),
                ]);
                setRolls(rollPayload.data || []);
                setCameras(cameraPayload.data || []);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : 'Failed to load film shelf');
            } finally {
                setIsLoading(false);
            }
        }
        loadShelf();
    }, []);

    const filteredRolls = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return rolls.filter((roll) => {
            if (status !== 'all' && roll.status !== status) return false;
            if (cameraId && roll.camera_id !== cameraId) return false;
            if (!needle) return true;
            return [roll.film_name, roll.brand, roll.notes, roll.location_name, roll.camera?.name]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(needle);
        });
    }, [cameraId, query, rolls, status]);

    if (isLoading) return <PageLoader message="Opening the film cupboard..." />;

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl space-y-7">
                <header className="space-y-5">
                    <div>
                        <p className="text-sm uppercase tracking-[0.22em] text-text-muted">Film Photography</p>
                        <h1 className="mt-1">The Film Cupboard</h1>
                    </div>
                </header>

                {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

                <Card className="p-4">
                    <div className="flex flex-wrap gap-3">
                        <div className="relative min-w-[240px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search film, camera, location, notes" className="pl-9 pr-9" />
                            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"><X size={16} /></button>}
                        </div>
                        <select className="input min-w-48" value={status} onChange={(event) => setStatus(event.target.value as FilmRollStatus | 'all')}>
                            <option value="all">All stages</option>
                            {Object.entries(filmRollStatusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
                        </select>
                        <select className="input min-w-48" value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
                            <option value="">All cameras</option>
                            {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                        </select>
                    </div>
                </Card>

                <section className="overflow-hidden rounded-3xl border border-[#5b3e28] bg-[#2e201a] shadow-xl">
                    <div className="border-b border-[#654737] bg-[linear-gradient(100deg,#4a3024,#38241c_45%,#523528)] px-6 py-4 text-[#f3dfc4]">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3"><Film size={19} /><h2 className="text-xl">Roll Library</h2></div>
                            <span className="text-sm text-[#c9aa88]">{filteredRolls.length} of {rolls.length} rolls</span>
                        </div>
                    </div>
                    {filteredRolls.length === 0 ? (
                        <div className="px-6 py-20 text-center text-[#d2b899]">
                            <Film className="mx-auto mb-4 opacity-60" size={38} />
                            <p>{rolls.length ? 'No rolls match these filters.' : 'Your cupboard is ready for its first roll.'}</p>
                            {!rolls.length && <Link href="/film/new-roll" className="mt-4 inline-flex rounded-full bg-[#f0d3a7] px-5 py-2 text-sm font-medium text-[#352319]">Register a roll</Link>}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-x-5 gap-y-8 bg-[linear-gradient(120deg,#c5a06b,#e4cfaa_45%,#b4834d)] px-5 py-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredRolls.map((roll, index) => (
                                <FilmCanister key={roll.id} roll={roll} index={index} />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppShell>
    );
}
