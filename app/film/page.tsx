'use client';

import { useEffect, useMemo, useState } from 'react';
import { Film, Search, X } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import {
    FilmCamera,
    FilmRoll,
    FilmRollStatus,
    filmRollStatusConfig,
} from '@/lib/types';
import { listFilmCameras, listFilmRolls } from '@/lib/film/core/client';
import { CameraCollection } from './_components/CameraCollection';
import { AddRollLink } from './_components/AddRollLink';
import { FilmShelf } from './_components/FilmShelf';

function getFilmShellClassName(className = 'p-5 md:p-8') {
    return `film-module ${className}`;
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
                const [loadedRolls, loadedCameras] = await Promise.all([
                    listFilmRolls(),
                    listFilmCameras(),
                ]);
                setRolls(loadedRolls);
                setCameras(loadedCameras);
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
            return [roll.film_name, roll.brand, roll.notes, roll.location_name, roll.camera?.name, roll.film_type, roll.process_type]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(needle);
        });
    }, [cameraId, query, rolls, status]);

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening the film cupboard..." contentClassName={getFilmShellClassName()}>
                <div />
            </AppShell>
        );
    }

    return (
        <AppShell pageTitle="Film & Camera Cupboard" contentClassName={getFilmShellClassName()}>
            <div className="mx-auto max-w-7xl space-y-5">
                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <section aria-labelledby="roll-library-title" className="overflow-hidden rounded-2xl border border-border-strong bg-nav-bg">
                    <div className="border-b border-border-strong bg-nav-bg-hover px-6 py-4 text-text-on-dark">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Film size={19} />
                                    <h2 id="roll-library-title" className="text-lg font-bold !text-text-on-dark">Roll Library</h2>
                                </div>
                                <span className="shrink-0 text-sm text-nav-text-muted">{filteredRolls.length} of {rolls.length} rolls</span>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                                <div className="relative min-w-0 flex-1 xl:w-[340px] xl:flex-none">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="pl-9 pr-9" />
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
                                    className="w-full sm:min-w-48 sm:flex-1 xl:w-48 xl:flex-none"
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
                                    className="w-full sm:min-w-48 sm:flex-1 xl:w-48 xl:flex-none"
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
                            <p>{rolls.length ? 'No rolls match these filters.' : 'No rolls yet.'}</p>
                            <div className="mt-4"><AddRollLink /></div>
                        </div>
                    ) : (
                        <FilmShelf rolls={filteredRolls} />
                    )}
                </section>
                <CameraCollection cameras={cameras} />
            </div>
        </AppShell>
    );
}
