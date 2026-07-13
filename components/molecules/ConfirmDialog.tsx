'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/atoms/Button';
import { WarningDoodleIcon } from '@/components/atoms/DoodleIcons';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    isConfirming?: boolean;
    tone?: 'destructive' | 'warning';
    onCancel: () => void;
    onConfirm: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    description,
    confirmLabel,
    isConfirming,
    tone = 'destructive',
    onCancel,
    onConfirm,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusFrame = requestAnimationFrame(() => cancelRef.current?.focus());

        return () => {
            cancelAnimationFrame(focusFrame);
            document.body.style.overflow = previousOverflow;
            previouslyFocusedRef.current?.focus();
            previouslyFocusedRef.current = null;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!isConfirming) {
                    event.preventDefault();
                    onCancel();
                }
                return;
            }
            if (event.key !== 'Tab') return;

            const dialog = dialogRef.current;
            if (!dialog) return;
            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement;
            if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isConfirming, isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center px-4" role="presentation">
            <button
                type="button"
                aria-label="Cancel confirmation"
                tabIndex={-1}
                className="absolute inset-0 bg-overlay-backdrop"
                onClick={onCancel}
                disabled={isConfirming}
            />
            <section
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                aria-busy={isConfirming || undefined}
                tabIndex={-1}
                className={cn(
                    'relative z-10 w-full max-w-md rounded-lg border p-6 shadow-subtle',
                    tone === 'destructive'
                        ? 'border-error bg-error-bg'
                        : 'border-warning bg-warning-bg'
                )}
            >
                <div className={cn(
                    'flex items-start gap-3 border-l-4 pl-4',
                    tone === 'destructive' ? 'border-error text-error' : 'border-warning text-warning'
                )}>
                    <WarningDoodleIcon size={22} className="mt-0.5 shrink-0" />
                    <div>
                        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                        <p id={descriptionId} className="mt-2 text-sm text-text-secondary">{description}</p>
                    </div>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={isConfirming}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                            tone === 'destructive'
                                ? 'border-error bg-error-bg text-error hover:border-error hover:bg-error-bg hover:text-error'
                                : 'border-warning bg-warning-bg text-warning hover:border-warning hover:bg-warning-bg hover:text-warning'
                        )}
                        onClick={onConfirm}
                        isLoading={isConfirming}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </section>
        </div>
    );
}
