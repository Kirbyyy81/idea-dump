'use client';

import { CheckDoodleIcon, OcrDoodleIcon } from '@/components/atoms/DoodleIcons';
import { cn } from '@/lib/utils';
import { FinanceOcrPhase } from '@/lib/finance/ocr/client';

interface OcrProgressProps {
    phase: Exclude<FinanceOcrPhase, 'idle'>;
    uploadProgress: number;
}

const STEPS = [
    { phase: 'uploading', label: 'Uploading screenshot' },
    { phase: 'reading', label: 'Reading screenshot' },
    { phase: 'preparing', label: 'Preparing review' },
] as const;

export function OcrProgress({ phase, uploadProgress }: OcrProgressProps) {
    const activeIndex = STEPS.findIndex((step) => step.phase === phase);
    const percentage = Math.min(100, Math.max(0, uploadProgress));

    return (
        <section
            className="mt-4 rounded-xl border border-border-default bg-bg-subtle p-4"
            aria-live="polite"
            aria-label="Screenshot processing progress"
        >
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <OcrDoodleIcon size={17} className="text-accent-blue" />
                <span>{STEPS[activeIndex].label}</span>
                {phase === 'uploading' && <span className="ml-auto tabular-nums text-text-muted">{percentage}%</span>}
            </div>

            {phase === 'uploading' && (
                <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-border-default"
                    role="progressbar"
                    aria-label="Screenshot upload"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                >
                    <div
                        className="h-full rounded-full bg-action-primary transition-[width] duration-200"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            )}

            {phase === 'reading' && (
                <p className="mt-2 text-xs text-text-muted">
                    The free reader may take about a minute to wake after being idle.
                </p>
            )}

            <ol className="mt-4 grid grid-cols-3 gap-2 text-xs">
                {STEPS.map((step, index) => {
                    const isComplete = index < activeIndex;
                    const isActive = index === activeIndex;
                    return (
                        <li
                            key={step.phase}
                            aria-current={isActive ? 'step' : undefined}
                            className={cn(
                                'flex min-w-0 items-center gap-1.5 text-text-muted',
                                (isComplete || isActive) && 'font-semibold text-text-primary'
                            )}
                        >
                            <span
                                className={cn(
                                    'grid size-5 shrink-0 place-items-center rounded-full border border-border-default bg-bg-elevated',
                                    isActive && 'border-accent-blue text-accent-blue',
                                    isComplete && 'border-success bg-success text-white'
                                )}
                                aria-hidden="true"
                            >
                                {isComplete ? <CheckDoodleIcon size={12} /> : index + 1}
                            </span>
                            <span className="truncate">{step.label.replace(' screenshot', '')}<span className="sr-only">{isComplete ? ', complete' : isActive ? ', current step' : ', not started'}</span></span>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
