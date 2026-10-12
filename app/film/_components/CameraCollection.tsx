import Link from 'next/link';
import { Camera } from 'lucide-react';
import type { FilmCameraView as FilmCamera } from '@/lib/types';
import { CameraIllustration } from './CameraIllustration';

export function CameraCollection({ cameras }: { cameras: FilmCamera[] }) {
    return (
        <section aria-labelledby="camera-collection-title" className="overflow-hidden rounded-2xl border border-border-strong bg-nav-bg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong bg-nav-bg-hover px-6 py-4 text-text-on-dark">
                <div className="flex flex-wrap items-center gap-3">
                    <Camera size={19} aria-hidden="true" />
                    <h2 id="camera-collection-title" className="text-lg font-bold !text-text-on-dark">Camera Collection</h2>
                    <span className="text-sm text-nav-text-muted">{cameras.length} {cameras.length === 1 ? 'camera' : 'cameras'}</span>
                </div>
                <Link href="/film/cameras" className="action-link rounded px-2 py-1 text-sm font-semibold !text-text-on-dark underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
                    Manage Cameras
                </Link>
            </div>
            {cameras.length ? (
                <ul className="grid grid-cols-1 gap-x-5 gap-y-8 bg-surface-film-shelf px-5 py-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cameras.map((camera) => (
                        <li key={camera.id} className="min-w-0">
                            <Link
                                href={`/film/cameras?camera=${encodeURIComponent(camera.id)}`}
                                aria-label={`Open ${camera.name} camera`}
                                className="action-link group flex h-full flex-col items-center rounded-xl px-3 py-4 text-center text-text-primary hover:bg-bg-surface/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-dark"
                            >
                                <CameraIllustration />
                                <h3 className="mt-3 w-full break-words text-base font-bold">{camera.name}</h3>
                                {(camera.brand || camera.model) && (
                                    <p className="mt-1 w-full break-words text-sm text-text-secondary">
                                        {[camera.brand, camera.model].filter(Boolean).join(' ')}
                                    </p>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="px-6 py-12 text-center text-nav-text-muted">
                    <Camera className="mx-auto mb-4 opacity-60" size={38} aria-hidden="true" />
                    <p>No cameras yet.</p>
                    <Link href="/film/cameras" className="action-link mt-4 inline-flex rounded-full bg-action-primary px-5 py-2 text-sm font-medium text-action-primary-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
                        Add Camera
                    </Link>
                </div>
            )}
        </section>
    );
}
