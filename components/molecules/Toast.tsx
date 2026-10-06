'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export function Toast({ message, onDismiss, duration = 5000, variant = 'success' }: {
    message: string; onDismiss: () => void; duration?: number; variant?: 'success' | 'error';
}) {
    const dismiss = useRef(onDismiss);
    dismiss.current = onDismiss;
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    useEffect(() => {
        if (hovered || focused) return;
        const timer = window.setTimeout(() => dismiss.current(), duration);
        return () => window.clearTimeout(timer);
    }, [duration, message, hovered, focused]);

    const Icon = variant === 'error' ? CircleAlert : CheckCircle2;
    return <div className={`toast-slide-in fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border py-2 pl-4 pr-2 text-sm font-medium shadow-subtle sm:bottom-6 sm:right-6 ${variant === 'error' ? 'border-error bg-error-bg text-error' : 'border-success bg-success-bg text-success'}`}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div role={variant === 'error' ? 'alert' : 'status'} aria-live={variant === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className="flex min-w-0 items-center gap-2">
            <Icon size={18} className="shrink-0" aria-hidden="true" /><span className="break-words">{message}</span>
        </div>
        <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" aria-label="Dismiss notification" onClick={onDismiss}><X size={16} aria-hidden="true" /></Button>
    </div>;
}
