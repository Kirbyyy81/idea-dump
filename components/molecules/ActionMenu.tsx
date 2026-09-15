'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export function ActionMenu({ label, items, disabled = false }: {
    label: string;
    items: { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }[];
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const focusLast = useRef(false);
    const menuId = useId();
    const triggerId = useId();
    useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => {
            const controls = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
            controls?.[focusLast.current ? controls.length - 1 : 0]?.focus();
        });
        const outside = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); };
    }, [open]);

    const close = () => { trigger.current?.focus(); setOpen(false); };
    return <div ref={container} className="relative shrink-0">
        <Button ref={trigger} id={triggerId} type="button" variant="ghost" className="size-10 p-0" disabled={disabled}
            aria-label={label} aria-haspopup="menu" aria-expanded={open && !disabled} aria-controls={menuId}
            onClick={() => { focusLast.current = false; setOpen(!open); }}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault(); focusLast.current = event.key === 'ArrowUp'; setOpen(true);
                }
            }}><MoreHorizontal size={20} aria-hidden="true" /></Button>
        {open && !disabled && <div ref={menu} id={menuId} role="menu" aria-labelledby={triggerId}
            className="absolute right-0 top-full z-30 mt-1 w-44 max-w-[calc(100vw-2rem)] rounded-md border border-border-default bg-bg-elevated p-1 shadow-subtle"
            onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
                if (event.key === 'Tab') { close(); return; }
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const controls = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
                const current = controls.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
                controls[next]?.focus();
            }}>
            {items.map((item) => <Button key={item.label} type="button" role="menuitem" variant="ghost" tabIndex={-1} disabled={item.disabled}
                className="min-h-10 w-full justify-start gap-2 rounded-sm px-3 text-left text-sm"
                onClick={() => { close(); item.onSelect(); }}>{item.icon}<span>{item.label}</span></Button>)}
        </div>}
    </div>;
}
