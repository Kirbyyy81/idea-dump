'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Film, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { FilmCamera, FilmRoll, FilmRollStatus, filmRollStatusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

const BOX_COLORS = [
    'from-[#d7493e] to-[#9f2925]',
    'from-[#e6b94f] to-[#b47b1e]',
    'from-[#3d7f78] to-[#24534f]',
    'from-[#3976a8] to-[#264d72]',
    'from-[#77715d] to-[#4b473b]',
];

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

                <section className="overflow-hidden rounded-2xl border border-[#4b3428] bg-[#2e201a] shadow-xl">
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
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0 px-5 pt-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                            {filteredRolls.map((roll, index) => (
                                <div key={roll.id} className="flex flex-col justify-end border-b-[14px] border-[#6f4933] pb-0 pt-3 shadow-[0_9px_0_#251710]">
                                    <Link href={`/film/rolls/${roll.id}`} className="group mx-auto block w-full max-w-[168px] px-1">
                                        <article className={cn('relative aspect-[3/4] overflow-hidden rounded-t-sm border border-white/20 bg-gradient-to-br p-3 text-white shadow-lg transition-transform group-hover:-translate-y-2', BOX_COLORS[index % BOX_COLORS.length])}>
                                            <div className="absolute -right-7 top-5 h-16 w-24 rotate-45 border-y border-white/20 bg-black/15" />
                                            <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">{roll.brand}</p>
                                            <h3 className="relative mt-2 text-lg font-bold leading-tight">{roll.film_name}</h3>
                                            <div className="absolute inset-x-3 bottom-3">
                                                <div className="mb-2 h-px bg-white/35" />
                                                <div className="flex items-end justify-between"><span className="text-xs">{roll.format}</span><span className="text-2xl font-black">{roll.iso}</span></div>
                                            </div>
                                        </article>
                                        <div className="space-y-1 py-3 text-center">
                                            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px]', filmRollStatusConfig[roll.status].colorClass)}>{filmRollStatusConfig[roll.status].label}</span>
                                            <p className="truncate text-xs text-[#c9aa88]">{roll.camera?.name || 'No camera assigned'}</p>
                                        </div>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppShell>
    );
}
