'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Film, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { FilmCamera, FilmRoll, FilmRollStatus, filmRollStatusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

const CANISTER_THEMES = [
    {
        body: 'var(--pastel-pink)',
        bodyDark: 'var(--error)',
        bodyLight: 'var(--pastel-pink-soft)',
        cap: 'var(--nav-bg)',
        label: 'var(--bg-surface)',
        accent: 'var(--pastel-pink)',
    },
    {
        body: 'var(--pastel-yellow)',
        bodyDark: 'var(--warning)',
        bodyLight: 'var(--pastel-yellow-soft)',
        cap: 'var(--nav-bg)',
        label: 'var(--bg-surface)',
        accent: 'var(--pastel-yellow)',
    },
    {
        body: 'var(--pastel-olive)',
        bodyDark: 'var(--success)',
        bodyLight: 'var(--pastel-olive-soft)',
        cap: 'var(--nav-bg)',
        label: 'var(--bg-surface)',
        accent: 'var(--pastel-olive)',
    },
    {
        body: 'var(--pastel-blue)',
        bodyDark: 'var(--info)',
        bodyLight: 'var(--pastel-blue-soft)',
        cap: 'var(--nav-bg)',
        label: 'var(--bg-surface)',
        accent: 'var(--pastel-blue)',
    },
    {
        body: 'var(--pastel-peach)',
        bodyDark: 'var(--text-secondary)',
        bodyLight: 'var(--bg-subtle)',
        cap: 'var(--nav-bg)',
        label: 'var(--bg-surface)',
        accent: 'var(--pastel-peach)',
    },
];

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

function FilmCoverFallback({
    roll,
    accentColor,
}: {
    roll: FilmRoll;
    accentColor: string;
}) {
    return (
        <div className="flex h-full flex-col justify-between bg-bg-subtle p-3 text-text-primary">
            <div>
                <div className="mb-3 h-1.5 w-12 rounded-full" style={{ backgroundColor: accentColor }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                    {roll.brand}
                </p>
                <p className="mt-1 text-lg font-bold leading-tight">{roll.film_name}</p>
            </div>
            <div className="flex items-end justify-between gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                <span>{roll.format}</span>
                <span>ISO {roll.iso}</span>
            </div>
        </div>
    );
}

function FilmCanister({ roll, index }: { roll: FilmRoll; index: number }) {
    const theme = CANISTER_THEMES[index % CANISTER_THEMES.length];
    const thumbnail = roll.cover_photo?.thumbnail_link;
    const status = filmRollStatusConfig[roll.status];
    const stripeCount = index % 2 === 0 ? 8 : 0;

    return (
        <Link href={`/film/rolls/${roll.id}`} className="group block">
            <article className="relative mx-auto flex min-h-[330px] max-w-[300px] items-center justify-center">
                <div className="relative h-[300px] w-[300px]">
                    <div
                        className="absolute left-[106px] top-[102px] z-0 h-[112px] w-[160px] [clip-path:inset(-50px_-50px_-50px_0)]"
                        aria-hidden="true"
                    >
                        <div className="absolute left-0 top-0 h-full w-[154px] -translate-x-[116px] overflow-hidden rounded-r-3xl border-y-2 border-r-2 border-border-dark/40 bg-nav-bg/70 transition-transform duration-500 ease-out group-hover:translate-x-0">
                            <div className="absolute inset-x-0 top-2 flex justify-around">
                                {Array.from({ length: 12 }).map((_, holeIndex) => (
                                    <span key={`top-strip-hole-${holeIndex}`} className="h-2 w-1.5 rounded-sm bg-bg-surface/20" />
                                ))}
                            </div>
                            <div className="absolute inset-x-0 bottom-2 flex justify-around">
                                {Array.from({ length: 12 }).map((_, holeIndex) => (
                                    <span key={`bottom-strip-hole-${holeIndex}`} className="h-2 w-1.5 rounded-sm bg-bg-surface/20" />
                                ))}
                            </div>
                            <div className="ml-8 flex h-full flex-col justify-center pr-4 text-action-primary-text opacity-0 transition-opacity delay-100 duration-300 group-hover:opacity-100">
                                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-pastel-yellow">
                                    {roll.brand}
                                </p>
                                <h2 className="mt-1 line-clamp-2 text-lg font-bold leading-tight">{roll.film_name}</h2>
                                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-pastel-yellow">
                                    <span>{formatCurrency(Number(roll.purchase_price || 0))}</span>
                                    <span>{roll.frames_taken || 0} frames</span>
                                </div>
                                <div className="mt-1 truncate text-[10px] font-semibold text-pastel-yellow">
                                    {roll.camera?.name || 'No camera'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <svg
                        viewBox="0 0 230 300"
                        role="img"
                        aria-labelledby={`film-roll-${roll.id}`}
                        className="absolute inset-y-0 left-0 z-10 h-full w-[230px] overflow-visible"
                    >
                        <title id={`film-roll-${roll.id}`}>{`${roll.brand} ${roll.film_name}`}</title>

                        <rect x="15" y="52" width="94" height="188" rx="4" fill={theme.body} stroke="var(--border-dark)" strokeWidth="3" />
                        <rect x="9" y="42" width="108" height="14" rx="2" fill={theme.cap} />
                        <rect x="22" y="35" width="82" height="7" rx="1.5" fill="var(--bg-surface)" />
                        <rect x="9" y="239" width="108" height="14" rx="2" fill={theme.cap} />
                        <rect x="22" y="253" width="82" height="7" rx="1.5" fill="var(--bg-surface)" />
                        <rect x="30" y="64" width="64" height="164" rx="2" fill={theme.label} opacity="0.96" />
                        <line x1="99" y1="65" x2="99" y2="226" stroke="var(--border-dark)" strokeWidth="2" />
                        <line x1="24" y1="64" x2="24" y2="226" stroke="var(--border-dark)" strokeWidth="2" opacity="0.35" />

                        {Array.from({ length: 8 }).map((_, holeIndex) => (
                            <rect
                                key={`body-hole-${holeIndex}`}
                                x="103"
                                y={75 + holeIndex * 17}
                                width="6"
                                height="9"
                                rx="1"
                                fill="var(--bg-surface)"
                                opacity="0.95"
                            />
                        ))}
                        {stripeCount > 0 && Array.from({ length: stripeCount }).map((_, stripeIndex) => (
                            <line
                                key={`stripe-${stripeIndex}`}
                                x1={38 + stripeIndex * 7}
                                x2={38 + stripeIndex * 7}
                                y1="68"
                                y2="224"
                                stroke={theme.accent}
                                strokeWidth="2.5"
                                opacity="0.82"
                            />
                        ))}
                        <text
                            x="47"
                            y="178"
                            fill="var(--text-primary)"
                            fontSize="15"
                            fontWeight="700"
                            transform="rotate(-90 47 178)"
                        >
                            {roll.format}
                        </text>
                        <text
                            x="67"
                            y="168"
                            fill="var(--text-primary)"
                            fontSize="18"
                            fontWeight="800"
                            transform="rotate(-90 67 168)"
                        >
                            {roll.iso}
                        </text>
                    </svg>

                    <div className="absolute left-[16px] top-[56px] z-20 h-[183px] w-[92px] overflow-hidden bg-bg-surface">
                        {thumbnail ? (
                            <Image
                                src={thumbnail}
                                alt={`${roll.film_name} cover`}
                                fill
                                sizes="92px"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <FilmCoverFallback roll={roll} accentColor={theme.accent} />
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-bg-surface/10" />
                        <div className="pointer-events-none absolute inset-0 border border-border-dark/20" />
                    </div>
                    <div className="absolute left-[26px] top-[222px] z-30 flex w-[70px] justify-center">
                        <span className={cn('rounded-full border px-2 py-1 text-[9px]', status.colorClass)}>
                            {status.label}
                        </span>
                    </div>
                </div>
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

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening the film cupboard..." contentClassName="p-5 md:p-8">
                <div />
            </AppShell>
        );
    }

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl space-y-5">
                <header>
                    <div>
                        <p className="text-sm uppercase tracking-wide text-text-muted">Film Photography</p>
                        <h1 className="mt-1">The Film Cupboard</h1>
                    </div>
                </header>

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <section className="overflow-hidden rounded-2xl border border-border-strong bg-nav-bg">
                    <div className="border-b border-border-strong bg-nav-bg-hover px-6 py-4 text-text-on-dark">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Film size={19} />
                                    <h2 className="text-lg font-bold !text-text-on-dark">Roll Library</h2>
                                </div>
                                <span className="shrink-0 text-sm text-nav-text-muted">{filteredRolls.length} of {rolls.length} rolls</span>
                            </div>
                            <div className="flex flex-wrap gap-3 xl:justify-end">
                                <div className="relative min-w-[240px] flex-1 xl:w-[340px] xl:flex-none">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search film, camera, location, notes" className="pl-9 pr-9" />
                                    {query && (
                                        <button
                                            type="button"
                                            onClick={() => setQuery('')}
                                            aria-label="Clear search"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                <Select
                                    value={status}
                                    onChange={(nextValue) => setStatus(nextValue as FilmRollStatus | 'all')}
                                    className="min-w-48 xl:w-48"
                                    options={[
                                        { value: 'all', label: 'All stages' },
                                        ...Object.entries(filmRollStatusConfig).map(([value, config]) => ({
                                            value,
                                            label: config.label,
                                        })),
                                    ]}
                                />
                                <Select
                                    value={cameraId}
                                    onChange={setCameraId}
                                    className="min-w-48 xl:w-48"
                                    options={[
                                        { value: '', label: 'All cameras' },
                                        ...cameras.map((camera) => ({ value: camera.id, label: camera.name })),
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                    {filteredRolls.length === 0 ? (
                        <div className="px-6 py-20 text-center text-nav-text-muted">
                            <Film className="mx-auto mb-4 opacity-60" size={38} />
                            <p>{rolls.length ? 'No rolls match these filters.' : 'Your cupboard is ready for its first roll.'}</p>
                            {!rolls.length && (
                                <Link href="/film/new-roll" className="mt-4 inline-flex rounded-full bg-action-primary px-5 py-2 text-sm font-medium text-action-primary-text">
                                    Register a roll
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-x-5 gap-y-8 bg-surface-film-shelf px-5 py-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
