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
        body: '#f2383f',
        bodyDark: '#8f1f24',
        bodyLight: '#ff6a70',
        leader: '#27364f',
        cap: '#1b2940',
        label: '#fff2df',
        accent: '#f2383f',
    },
    {
        body: '#f59f22',
        bodyDark: '#9c5c10',
        bodyLight: '#ffc15b',
        leader: '#24314b',
        cap: '#19263d',
        label: '#fff6d8',
        accent: '#f59f22',
    },
    {
        body: '#f8f1dc',
        bodyDark: '#b9a46e',
        bodyLight: '#fff9eb',
        leader: '#323232',
        cap: '#252525',
        label: '#ffffff',
        accent: '#323232',
    },
    {
        body: '#2f5f9f',
        bodyDark: '#1c375c',
        bodyLight: '#6f9ad0',
        leader: '#f7f1e2',
        cap: '#1d2f4e',
        label: '#eaf3ff',
        accent: '#2f5f9f',
    },
    {
        body: '#f7f4e9',
        bodyDark: '#b8b2a1',
        bodyLight: '#ffffff',
        leader: '#f7f4e9',
        cap: '#2c3442',
        label: '#ffffff',
        accent: '#2c3442',
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
        <div className="flex h-full flex-col justify-between bg-[radial-gradient(circle_at_top_left,#ffffff_0,#fff8e7_46%,#ead5a5_100%)] p-3 text-[#2e2318]">
            <div>
                <div className="mb-3 h-1.5 w-12 rounded-full" style={{ backgroundColor: accentColor }} />
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
    const status = filmRollStatusConfig[roll.status];
    const stripeCount = theme.body === '#f8f1dc' || theme.body === '#f7f4e9' ? 8 : 0;

    return (
        <Link href={`/film/rolls/${roll.id}`} className="group block">
            <article className="relative mx-auto flex min-h-[410px] max-w-[260px] flex-col items-center transition-transform duration-300 group-hover:-translate-y-2">
                <div className="relative h-[300px] w-[230px] drop-shadow-[0_24px_22px_rgba(47,28,14,0.32)]">
                    <svg
                        viewBox="0 0 230 300"
                        role="img"
                        aria-labelledby={`film-roll-${roll.id}`}
                        className="absolute inset-0 h-full w-full overflow-visible"
                    >
                        <title id={`film-roll-${roll.id}`}>{`${roll.brand} ${roll.film_name}`}</title>
                        <defs>
                            <linearGradient id={`body-${roll.id}`} x1="0" x2="1" y1="0" y2="1">
                                <stop offset="0%" stopColor={theme.bodyLight} />
                                <stop offset="48%" stopColor={theme.body} />
                                <stop offset="100%" stopColor={theme.bodyDark} />
                            </linearGradient>
                            <linearGradient id={`leader-${roll.id}`} x1="0" x2="1">
                                <stop offset="0%" stopColor={theme.leader} />
                                <stop offset="100%" stopColor={theme.leader === '#f7f1e2' ? '#d7cfb8' : '#4a4a4a'} />
                            </linearGradient>
                        </defs>

                        <path
                            d="M105 62 H197 Q210 62 210 75 V103 Q210 121 192 121 H155 Q145 121 145 132 V143 H105 Z"
                            fill={`url(#leader-${roll.id})`}
                            stroke="#191919"
                            strokeWidth="3"
                            strokeLinejoin="round"
                        />
                        <rect x="15" y="52" width="94" height="188" rx="4" fill={`url(#body-${roll.id})`} stroke="#1d1d1d" strokeWidth="3" />
                        <rect x="9" y="42" width="108" height="14" rx="2" fill={theme.cap} />
                        <rect x="22" y="35" width="82" height="7" rx="1.5" fill="#f6f6f1" />
                        <rect x="9" y="239" width="108" height="14" rx="2" fill={theme.cap} />
                        <rect x="22" y="253" width="82" height="7" rx="1.5" fill="#f6f6f1" />
                        <rect x="30" y="64" width="64" height="164" rx="2" fill={theme.label} opacity="0.96" />
                        <line x1="99" y1="65" x2="99" y2="226" stroke="#101010" strokeWidth="2" />
                        <line x1="24" y1="64" x2="24" y2="226" stroke="#101010" strokeWidth="2" opacity="0.35" />

                        {Array.from({ length: 12 }).map((_, holeIndex) => (
                            <rect
                                key={`leader-hole-${holeIndex}`}
                                x={108 + holeIndex * 7}
                                y="70"
                                width="4"
                                height="8"
                                rx="1"
                                fill="#f5f2e8"
                                opacity={theme.leader === '#f7f1e2' ? 0.75 : 0.95}
                            />
                        ))}
                        {Array.from({ length: 8 }).map((_, holeIndex) => (
                            <rect
                                key={`body-hole-${holeIndex}`}
                                x="103"
                                y={75 + holeIndex * 17}
                                width="6"
                                height="9"
                                rx="1"
                                fill="#f5f2e8"
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
                            fill="#111111"
                            fontSize="15"
                            fontWeight="700"
                            transform="rotate(-90 47 178)"
                        >
                            {roll.format}
                        </text>
                        <text
                            x="67"
                            y="168"
                            fill="#111111"
                            fontSize="18"
                            fontWeight="800"
                            transform="rotate(-90 67 168)"
                        >
                            {roll.iso}
                        </text>
                        <text x="199" y="140" fill="#111111" fontSize="13" fontWeight="800">
                            {roll.frames_taken || 0}
                        </text>
                    </svg>

                    <div className="absolute left-[30px] top-[64px] h-[164px] w-[64px] overflow-hidden border border-black/15 bg-white">
                        {thumbnail ? (
                            <img
                                src={thumbnail}
                                alt={`${roll.film_name} cover`}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <FilmCoverFallback roll={roll} accentColor={theme.accent} />
                        )}
                    </div>
                </div>

                <div className="mt-4 w-full rounded-2xl border border-[#7a5738]/45 bg-[#fff8e8]/88 p-4 text-[#2d2016] shadow-[0_12px_26px_rgba(68,43,23,0.18)] transition-colors group-hover:bg-white">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-[#7a5738]">{roll.brand}</p>
                            <h2 className="mt-1 line-clamp-2 text-xl leading-tight text-[#2d2016]">{roll.film_name}</h2>
                        </div>
                        <span className={cn('shrink-0 rounded-full border px-2 py-1 text-[10px]', status.colorClass)}>
                            {status.label}
                        </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-medium text-[#6d5338]">
                        <span>{roll.format} / ISO {roll.iso}</span>
                        <span className="text-right">{formatCurrency(Number(roll.purchase_price || 0))}</span>
                        <span className="col-span-2 truncate">
                            {roll.camera?.name || 'No camera'}{roll.location_name ? ` - ${roll.location_name}` : ''}
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
