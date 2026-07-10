'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { FilmPhoto, FilmRoll } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StepStepperProps {
    roll: FilmRoll;
    photos: FilmPhoto[];
    activeStep: string;
    rollId: string;
}

export function StepStepper({ roll, photos, activeStep, rollId }: StepStepperProps) {
    const hasDriveFolder = Boolean(roll.drive_folder_id);
    const hasSyncedPhotos = photos.length > 0;
    const hasFinishedFilm = roll.status === 'PROCESSING' || roll.status === 'PROCESSED';
    const hasFinishedProcessing = roll.status === 'PROCESSED';

    const setupSteps = [
        { label: 'Film', slug: 'film', isComplete: hasFinishedFilm },
        { label: 'Processing', slug: 'processing', isComplete: hasFinishedProcessing },
        { label: 'Drive', slug: 'drive', isComplete: hasDriveFolder },
        { label: 'Photobook', slug: 'photobook', isComplete: hasSyncedPhotos },
    ];

    return (
        <nav aria-label="Film roll workflow" className="rounded-lg border border-border-default bg-bg-elevated p-2 sm:p-3">
            <ol className="grid grid-cols-4">
                {setupSteps.map((step, index) => {
                    const href = `/film/rolls/${rollId}?step=${step.slug}`;
                    const isActive = activeStep === step.slug;

                    return (
                        <li key={step.slug} className="relative min-w-0">
                            {index < setupSteps.length - 1 && (
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-[1.15rem] h-0.5',
                                        step.isComplete ? 'bg-accent-sage' : 'bg-border-default'
                                    )}
                                />
                            )}
                            <Link
                                href={href}
                                aria-current={isActive ? 'step' : undefined}
                                className={cn(
                                    'action-link relative z-10 flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-center text-[11px] transition-colors sm:text-xs',
                                    isActive
                                        ? 'text-text-primary'
                                        : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                                )}
                            >
                                <span
                                    className={cn(
                                        'grid size-7 shrink-0 place-items-center rounded-full border bg-bg-elevated text-xs font-bold',
                                        step.isComplete
                                            ? 'border-accent-sage bg-accent-sage text-text-primary'
                                            : isActive
                                                ? 'border-accent-sage bg-pastel-olive-soft text-text-primary shadow-subtle'
                                                : 'border-border-default text-text-muted'
                                    )}
                                >
                                    {step.isComplete ? <CheckCircle size={14} /> : index + 1}
                                </span>
                                <span className={cn('truncate font-semibold', isActive && 'text-text-primary')}>{step.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
