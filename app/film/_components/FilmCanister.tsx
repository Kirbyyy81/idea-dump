'use client';

import Link from 'next/link';
import { getFilmPhotoThumbnailUrl } from '@/lib/film/core/client';
import { getFilmLabelImageForRoll } from '@/lib/film/catalog';
import Image from 'next/image';
import type { FilmRollSummary as FilmRoll } from '@/lib/types';
import { formatCurrencyMYR } from '@/lib/utils';

export const FILM_ROLL_WIDTH = 128;
export const FILM_ROLL_EXPANDED_WIDTH = 270;

interface FilmCanisterProps {
    roll: FilmRoll;
    index: number;
    expanded: boolean;
    scale: number;
    onHover: (id: string, pointerType: string) => void;
    onFocus: (id: string) => void;
    onBlur: () => void;
}
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

function FilmCoverFallback({
    roll,
    accentColor,
}: {
    roll: FilmRoll;
    accentColor: string;
}) {
    const labelImage = getFilmLabelImageForRoll(roll.brand, roll.film_name);
    if (labelImage) {
        return (
            <div className="relative h-full w-full bg-bg-subtle">
                <Image
                    src={labelImage}
                    alt={`${roll.brand} ${roll.film_name} label`}
                    fill
                    sizes="92px"
                    unoptimized
                    className="object-contain"
                />
            </div>
        );
    }
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

export function FilmCanister({ roll, index, expanded, scale, onHover, onFocus, onBlur }: FilmCanisterProps) {
    const theme = CANISTER_THEMES[index % CANISTER_THEMES.length];
    const thumbnail = roll.cover_image_url || (roll.cover_photo_id ? getFilmPhotoThumbnailUrl(roll.cover_photo_id) : null);
    const stripeCount = index % 2 === 0 ? 8 : 0;

    return (
        <div
            data-expanded={expanded}
            className="group shrink-0 overflow-visible transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: (expanded ? FILM_ROLL_EXPANDED_WIDTH : FILM_ROLL_WIDTH) * scale }}
        >
            <Link
                href={`/film/rolls/${roll.id}`}
                className="action-link block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-dark"
                aria-label={`Open ${roll.film_name} roll`}
                onPointerMove={(event) => onHover(roll.id, event.pointerType)}
                onFocus={() => onFocus(roll.id)}
                onBlur={onBlur}
            >
                <article className="relative" style={{ height: 260 * scale }}>
                    <div className="pointer-events-none absolute left-0 h-[300px] w-[270px] origin-top-left" style={{ top: -20 * scale, transform: `scale(${scale})` }}>
                        <div
                            className="absolute left-[106px] top-[90px] z-0 h-[136px] w-[160px] [clip-path:inset(-50px_-50px_-50px_0)]"
                            aria-hidden="true"
                        >
                            <div className="absolute left-0 top-0 h-full w-[154px] -translate-x-[134px] overflow-hidden rounded-r-3xl border-y-2 border-r-2 border-border-dark/40 bg-black/80 backdrop-blur-md shadow-none transition-[transform,box-shadow] duration-500 ease-out group-data-[expanded=true]:translate-x-0 group-data-[expanded=true]:shadow-[8px_10px_14px_rgba(0,0,0,0.20)] motion-reduce:transition-none">
                                <div className="absolute inset-x-0 top-2 flex justify-around">
                                    {Array.from({ length: 12 }).map((_, holeIndex) => (
                                        <span key={`top-strip-hole-${holeIndex}`} className="h-2 w-1.5 rounded-sm bg-bg-surface/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]" />
                                    ))}
                                </div>
                                <div className="absolute inset-x-0 bottom-2 flex justify-around">
                                    {Array.from({ length: 12 }).map((_, holeIndex) => (
                                        <span key={`bottom-strip-hole-${holeIndex}`} className="h-2 w-1.5 rounded-sm bg-bg-surface/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]" />
                                    ))}
                                </div>
                                <div className="ml-8 flex h-full flex-col justify-center pr-4 text-[#ffcc88] opacity-0 mix-blend-screen transition-opacity delay-100 duration-300 group-data-[expanded=true]:opacity-100 motion-reduce:transition-none [text-shadow:_0_0_8px_rgba(255,166,77,0.6)]">
                                    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#ffb84d]">
                                        {roll.brand}
                                    </p>
                                    <h2 className="mt-1 line-clamp-2 text-lg font-bold leading-tight text-[#ffcc88]">{roll.film_name}</h2>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-[#ffb84d]">
                                        <span>{formatCurrencyMYR(Number(roll.purchase_price || 0))}</span>
                                        <span>{roll.frames_taken || 0} frames</span>
                                    </div>
                                    <div className="mt-1 truncate text-[10px] font-semibold text-[#ffb84d]">
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
                            <defs>
                                <linearGradient id={`body-${roll.id}`} x1="0" x2="1" y1="0" y2="1">
                                    <stop offset="0%" stopColor={theme.bodyLight} />
                                    <stop offset="48%" stopColor={theme.body} />
                                    <stop offset="100%" stopColor={theme.bodyDark} />
                                </linearGradient>
                            </defs>

                            <rect x="15" y="52" width="94" height="188" rx="4" fill={`url(#body-${roll.id})`} stroke="var(--border-dark)" strokeWidth="3" />
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
                                    unoptimized
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <FilmCoverFallback roll={roll} accentColor={theme.accent} />
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_20%,rgba(255,255,255,0.1)_40%,rgba(0,0,0,0)_80%,rgba(0,0,0,0.3)_100%)]" />
                            <div className="pointer-events-none absolute inset-0 border border-border-dark/20" />
                        </div>
                    </div>
                </article>
            </Link>
        </div>
    );
}

