'use client';

import { useEffect, useId, useRef } from 'react';
import { useAlert } from '@/lib/contexts/AlertContext';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const ICONS = {
    error: AlertCircle,
    success: CheckCircle,
    warning: AlertTriangle,
    info: Info,
};

const STYLES = {
    error: {
        bg: 'bg-error-bg',
        border: 'border-error',
        icon: 'text-error',
        title: 'text-error',
    },
    success: {
        bg: 'bg-success-bg',
        border: 'border-accent-sage',
        icon: 'text-accent-sage',
        title: 'text-accent-sage',
    },
    warning: {
        bg: 'bg-warning-bg',
        border: 'border-warning',
        icon: 'text-warning',
        title: 'text-warning',
    },
    info: {
        bg: 'bg-bg-subtle',
        border: 'border-accent-blue',
        icon: 'text-accent-blue',
        title: 'text-accent-blue',
    },
};

/**
 * Global alert dialog component that displays error, success, warning, or info messages.
 * Must be placed inside an AlertProvider.
 */
export function AlertDialog() {
    const { alert, hideAlert } = useAlert();
    const dialogRef = useRef<HTMLDivElement>(null);
    const dismissButtonRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const lastFocusedElementRef = useRef<HTMLElement | null>(null);
    const titleId = `alert-title-${useId()}`;
    const messageId = `alert-message-${useId()}`;

    useEffect(() => {
        const rememberFocus = (event: FocusEvent) => {
            if (!alert.isOpen && event.target instanceof HTMLElement && event.target !== document.body) {
                lastFocusedElementRef.current = event.target;
            }
        };
        document.addEventListener('focusin', rememberFocus);
        return () => document.removeEventListener('focusin', rememberFocus);
    }, [alert.isOpen]);

    useEffect(() => {
        if (!alert.isOpen) return;

        const activeElement = document.activeElement as HTMLElement | null;
        previousFocusRef.current = activeElement && activeElement !== document.body
            ? activeElement
            : lastFocusedElementRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => dismissButtonRef.current?.focus());

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                hideAlert();
                return;
            }
            if (e.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length === 0) {
                e.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            requestAnimationFrame(() => {
                if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
            });
        };
    }, [alert.isOpen, hideAlert]);

    if (!alert.isOpen) return null;

    const Icon = ICONS[alert.type];
    const styles = STYLES[alert.type];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={hideAlert}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-overlay-backdrop" />

            {/* Dialog */}
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                tabIndex={-1}
                className={cn(
                    "relative z-10 w-full max-w-md mx-4 p-6 rounded-lg shadow-subtle",
                    "bg-bg-elevated border",
                    styles.border
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    type="button"
                    onClick={hideAlert}
                    className="absolute right-3 top-3 grid size-10 place-items-center rounded-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                {/* Icon and Title */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={cn("p-2 rounded-full", styles.bg)}>
                        <Icon size={24} className={styles.icon} />
                    </div>
                    <h2 id={titleId} className={cn("text-lg font-bold", styles.title)}>
                        {alert.title}
                    </h2>
                </div>

                {/* Message */}
                <p id={messageId} className="text-text-secondary mb-6">
                    {alert.message}
                </p>

                {/* Action */}
                <div className="flex justify-end">
                    <Button ref={dismissButtonRef} variant="secondary" onClick={hideAlert}>
                        Dismiss
                    </Button>
                </div>
            </div>
        </div>
    );
}
