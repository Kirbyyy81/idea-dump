'use client';

import { PropsWithChildren, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps extends PropsWithChildren {
    isOpen: boolean;
    title: string;
    onClose: () => void;
}

export function Modal({ isOpen, title, onClose, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = `modal-title-${useId()}`;

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => dialogRef.current?.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <button type="button" className="absolute inset-0 bg-overlay-backdrop" onClick={onClose} aria-label="Close dialog" />
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border-default bg-bg-elevated p-5 shadow-subtle">
            <div className="flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg font-bold">{title}</h2><button type="button" onClick={onClose} className="grid size-9 place-items-center text-text-muted hover:text-text-primary" aria-label="Close"><X size={18} /></button></div>
            <div className="mt-5">{children}</div>
        </div>
    </div>;
}
