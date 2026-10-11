'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

export function FilmPhotoImage({ src, alt, className, loading = 'lazy' }: {
    src: string;
    alt: string;
    className: string;
    loading?: 'lazy' | 'eager';
}) {
    const [failedSource, setFailedSource] = useState<string | null>(null);

    if (failedSource === src) {
        return (
            <span role="img" aria-label={`${alt}, preview unavailable`} className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-text-muted">
                <ImageIcon size={24} aria-hidden="true" />
                <span className="line-clamp-2">{alt}</span>
            </span>
        );
    }

    return <img src={src} alt={alt} className={className} loading={loading} decoding="async" onError={() => setFailedSource(src)} />;
}
