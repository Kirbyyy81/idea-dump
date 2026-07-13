'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthPickerProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

const MONTHS = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2020, month, 1))
);

function parseMonth(value: string) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
    return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
    const selected = parseMonth(value);
    const selectedYear = selected?.year;
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [viewYear, setViewYear] = useState(selectedYear ?? new Date().getFullYear());
    const [position, setPosition] = useState({ left: 0, top: 0, width: 288 });
    const dialogId = `month-picker-${useId()}`;

    const close = () => {
        setIsOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
    };

    useEffect(() => {
        if (selectedYear) setViewYear(selectedYear);
    }, [selectedYear]);

    useEffect(() => {
        if (!isOpen) return;

        const updatePosition = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(288, window.innerWidth - 16);
            setPosition({
                left: Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8),
                top: Math.min(rect.bottom + 6, window.innerHeight - (menuRef.current?.offsetHeight ?? 240) - 8),
                width,
            });
        };
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };

        updatePosition();
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen]);

    const chooseMonth = (month: number) => {
        onChange(`${viewYear}-${String(month + 1).padStart(2, '0')}`);
        close();
    };
    const displayLabel = selected
        ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(selected.year, selected.month, 1))
        : 'Choose month';

    return <div ref={containerRef} className={cn('relative', className)}>
        <button ref={buttonRef} type="button" aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={dialogId} onClick={() => setIsOpen((current) => !current)} className="flex h-9 items-center gap-2 px-3 font-semibold text-text-primary transition-colors hover:bg-bg-hover">
            <CalendarDays size={16} className="text-text-muted" />{displayLabel}
        </button>
        {isOpen && createPortal(<div ref={menuRef} id={dialogId} role="dialog" aria-modal="true" aria-label="Choose month and year" style={position} className="fixed z-50 rounded-lg border border-border-default bg-bg-elevated p-3 shadow-subtle">
            <div className="flex items-center justify-between">
                <button type="button" className="btn-ghost grid size-8 min-h-8 place-items-center p-0" onClick={() => setViewYear((year) => year - 1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
                <p className="font-semibold">{viewYear}</p>
                <button type="button" className="btn-ghost grid size-8 min-h-8 place-items-center p-0" onClick={() => setViewYear((year) => year + 1)} aria-label="Next year"><ChevronRight size={16} /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">{MONTHS.map((label, month) => {
                const isSelected = selected?.year === viewYear && selected.month === month;
                return <button key={label} type="button" aria-pressed={isSelected} onClick={() => chooseMonth(month)} className={cn('h-9 rounded-sm text-sm font-medium transition-colors', isSelected ? 'bg-action-primary text-action-primary-text' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary')}>{label}</button>;
            })}</div>
        </div>, document.body)}
    </div>;
}
