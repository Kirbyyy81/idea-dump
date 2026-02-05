'use client';

import { useEffect, useRef } from 'react';
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

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && alert.isOpen) {
                hideAlert();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [alert.isOpen, hideAlert]);

    // Focus trap
    useEffect(() => {
        if (alert.isOpen && dialogRef.current) {
            dialogRef.current.focus();
        }
    }, [alert.isOpen]);

    if (!alert.isOpen) return null;

    const Icon = ICONS[alert.type];
    const styles = STYLES[alert.type];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={hideAlert}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Dialog */}
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="alert-title"
                aria-describedby="alert-message"
                tabIndex={-1}
                className={cn(
                    "relative z-10 w-full max-w-md mx-4 p-6 rounded-lg shadow-xl",
                    "bg-bg-elevated border",
                    styles.border
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={hideAlert}
                    className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                {/* Icon and Title */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={cn("p-2 rounded-full", styles.bg)}>
                        <Icon size={24} className={styles.icon} />
                    </div>
                    <h2 id="alert-title" className={cn("text-lg font-heading font-medium", styles.title)}>
                        {alert.title}
                    </h2>
                </div>

                {/* Message */}
                <p id="alert-message" className="text-text-secondary mb-6">
                    {alert.message}
                </p>

                {/* Action */}
                <div className="flex justify-end">
                    <Button variant="secondary" onClick={hideAlert}>
                        Dismiss
                    </Button>
                </div>
            </div>
        </div>
    );
}
