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
    const hasProcessingDetails = Boolean(
        roll.lab_name ||
        roll.processing_date ||
        Number(roll.processing_cost || 0) > 0 ||
        Number(roll.scanning_cost || 0) > 0 ||
        Number(roll.shipping_cost || 0) > 0
    );
    const hasDriveFolder = Boolean(roll.drive_folder_id);
    const hasSyncedPhotos = photos.length > 0;
    const canShowPhotobook = hasProcessingDetails && hasSyncedPhotos;

    const setupSteps = [
        { label: 'Film', slug: 'film', isComplete: true },
        { label: 'Processing', slug: 'processing', isComplete: hasProcessingDetails },
        { label: 'Drive', slug: 'drive', isComplete: hasDriveFolder },
        { label: 'Photobook', slug: 'photobook', isComplete: canShowPhotobook },
    ];

    return (
        <section className="grid gap-3 md:grid-cols-4">
            {setupSteps.map((step, index) => {
                const href = `/film/rolls/${rollId}?step=${step.slug}`;
                const isActive = activeStep === step.slug;

                return (
                    <Link
                        key={step.slug}
                        href={href}
                        className={cn(
                            'action-link flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                            isActive
                                ? 'border-accent-sage bg-pastel-olive-soft text-text-primary'
                                : step.isComplete
                                    ? 'border-accent-sage bg-pastel-olive-soft text-text-primary hover:bg-pastel-olive-soft/80'
                                    : 'border-border-default bg-bg-elevated text-text-muted hover:bg-bg-hover'
                        )}
                    >
                        <span
                            className={cn(
                                'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold',
                                step.isComplete
                                    ? 'border-accent-sage bg-accent-sage text-text-primary'
                                    : 'border-border-default bg-bg-hover text-text-muted'
                            )}
                        >
                            {step.isComplete ? <CheckCircle size={14} /> : index + 1}
                        </span>
                        <span className="font-semibold">{step.label}</span>
                    </Link>
                );
            })}
        </section>
    );
}
