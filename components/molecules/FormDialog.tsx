'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from '@/components/atoms/Button';

export function FormDialog({ title, children, onClose, busy = false }: {
    title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
    const panel = useRef<HTMLElement>(null);
    const closeRef = useRef(onClose);
    const busyRef = useRef(busy);
    closeRef.current = onClose;
    busyRef.current = busy;
    const titleId = useId();
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const frame = requestAnimationFrame(() => {
            const target = panel.current?.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled])') ?? panel.current;
            target?.focus();
        });
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            const active = document.activeElement as HTMLElement | null;
            const portal = active?.closest('[role="listbox"], [role="dialog"]');
            if (portal && portal !== panel.current) return;
            if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); }
            if (event.key !== 'Tab' || !panel.current) return;
            const controls = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); panel.current.focus(); }
            else if (event.shiftKey && (active === first || !panel.current.contains(active))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', keydown);
            document.body.style.overflow = overflow;
            previous?.focus();
        };
    }, []);
    return <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay-backdrop p-3 sm:p-6">
        <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}
            className="max-h-full min-w-0 w-full max-w-2xl overflow-y-auto rounded-lg border border-border-default bg-bg-surface p-5 shadow-subtle sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-bold">{title}</h2>
                <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Close</Button></div>
            {children}
        </section>
    </div>;
}
