'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export function Toast({ message, onDismiss, duration = 5000 }: {
    message: string; onDismiss: () => void; duration?: number;
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

    return <div className="toast-slide-in fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-success bg-success-bg py-2 pl-4 pr-2 text-sm font-medium text-success shadow-subtle sm:bottom-6 sm:right-6"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" /><span className="break-words">{message}</span>
        </div>
        <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" aria-label="Dismiss notification" onClick={onDismiss}><X size={16} aria-hidden="true" /></Button>
    </div>;
}
