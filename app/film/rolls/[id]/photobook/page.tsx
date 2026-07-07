'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BookOpen, FolderSync, Heart, Image as ImageIcon, Star } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { FilmPhoto, FilmRoll } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import { RollHeader } from '../_components/RollHeader';
import { StepStepper } from '../_components/StepStepper';
import { StatsCards } from '../_components/StatsCards';

export default function PhotobookPage() {
    const { showSuccess } = useAlert();
    const params = useParams();
    const rollId = params.id as string;
    const [roll, setRoll] = useState<FilmRoll | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadRoll = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/film/rolls/${rollId}`);
            if (!res.ok) throw new Error('Failed to load film roll');
            const payload = await res.json();
            setRoll(payload.data);
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
    const favoritePhotos = photos.filter((photo) => photo.is_favorite);
    const hasProcessingDetails = Boolean(
        roll?.lab_name ||
        roll?.processing_date ||
        Number(roll?.processing_cost || 0) > 0 ||
        Number(roll?.scanning_cost || 0) > 0 ||
        Number(roll?.shipping_cost || 0) > 0
    );
    const hasSyncedPhotos = photos.length > 0;
    const canShowPhotobook = hasProcessingDetails && hasSyncedPhotos;

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
            showSuccess(updates.set_as_cover ? 'Cover photo selected.' : 'Photo updated.', 'Saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update photo');
        }
    };

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening photobook..." contentClassName="p-8">
                <div />
            </AppShell>
        );
    }

    if (!roll) {
        return (
            <AppShell contentClassName="p-8">
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
        <AppShell contentClassName="p-8">
            <div className="max-w-7xl space-y-8">
                <RollHeader roll={roll} showSave={false} />

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <StatsCards roll={roll} />

                <StepStepper roll={roll} photos={photos} activeStep="photobook" rollId={roll.id} />

                <Card className="p-0">
                    <div className="border-b border-border-default px-6 py-4">
                        <div className="flex items-center gap-2">
                            <BookOpen size={18} className="text-accent-rose" />
                            <h2 className="text-lg font-bold">Photobook</h2>
                        </div>
                    </div>
                    <div className="p-6">
                        {!hasProcessingDetails ? (
                            <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-12 text-center">
                                <ImageIcon className="mx-auto mb-3 text-text-muted" size={34} />
                                <p className="text-text-secondary">Processing comes before the photobook.</p>
                                <p className="mt-1 text-sm text-text-muted">
                                    Add the lab, date, or costs first. Drive setup can happen now or later.
                                </p>
                            </div>
                        ) : !hasSyncedPhotos ? (
                            <div className="rounded-lg border border-dashed border-border-default bg-bg-hover/40 p-12 text-center">
                                <FolderSync className="mx-auto mb-3 text-text-muted" size={34} />
                                <p className="text-text-secondary">Ready for Drive sync.</p>
                                <p className="mt-1 text-sm text-text-muted">
                                    Processing is tracked. Link or sync the Google Drive folder to open this photobook.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {photos.map((photo) => (
                                    <article key={photo.id} className="overflow-hidden rounded-lg border border-border-default bg-bg-elevated">
                                        <a href={photo.web_view_link ?? '#'} target="_blank" rel="noreferrer" className="action-link block aspect-[4/3] bg-bg-hover">
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

                {canShowPhotobook && favoritePhotos.length > 0 && (
                    <Card className="p-5">
                        <h2 className="text-lg font-bold">Favorite Shots</h2>
                        <div className="mt-4 flex gap-3 overflow-x-auto snap-x pb-2">
                            {favoritePhotos.map((photo) => (
                                <a key={`favorite-${photo.id}`} href={photo.web_view_link ?? '#'} target="_blank" rel="noreferrer" className="action-link block h-28 w-36 shrink-0 snap-start overflow-hidden rounded-lg border border-border-default bg-bg-hover">
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
        </AppShell>
    );
}
