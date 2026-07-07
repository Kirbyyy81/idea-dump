'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    buttonClassName?: string;
    ariaLabel?: string;
    disabled?: boolean;
}

function getTodayInputDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseInputDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function formatInputDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
    const date = parseInputDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function DatePicker({
    value,
    onChange,
    placeholder = 'Select date',
    className,
    buttonClassName,
    ariaLabel,
    disabled,
}: DatePickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 0 });
    const selectedDate = parseInputDate(value);
    const [viewDate, setViewDate] = useState(() => selectedDate ?? parseInputDate(getTodayInputDate()) ?? new Date());

    useEffect(() => {
        const nextSelectedDate = parseInputDate(value);
        if (nextSelectedDate) setViewDate(nextSelectedDate);
    }, [value]);

    useEffect(() => {
        if (!isOpen) return;

        function updateMenuPosition() {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            setMenuPosition({
                left: rect.left,
                top: rect.bottom + 4,
                width: Math.max(rect.width, 320),
            });
        }

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);

        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        function handlePointerDown(event: PointerEvent) {
            const target = event.target as Node;
            const isInsideTrigger = containerRef.current?.contains(target);
            const isInsideMenu = menuRef.current?.contains(target);

            if (!isInsideTrigger && !isInsideMenu) {
                setIsOpen(false);
            }
        }

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    const weeks = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        const start = new Date(firstOfMonth);
        start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [viewDate]);

    const chooseDate = (date: Date) => {
        onChange(formatInputDate(date));
        setIsOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
    };

    const changeMonth = (offset: number) => {
        setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    };

    const jumpToToday = () => {
        const today = parseInputDate(getTodayInputDate()) ?? new Date();
        setViewDate(today);
        chooseDate(today);
    };

    const monthLabel = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
    }).format(viewDate);

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
                onClick={() => setIsOpen((current) => !current)}
                className={cn(
                    'input flex h-10 items-center justify-between gap-2 pr-10 text-left',
                    disabled && 'cursor-not-allowed opacity-60',
                    buttonClassName
                )}
            >
                <span className={cn('truncate', !value && 'text-text-muted')}>
                    {value ? formatDisplayDate(value) : placeholder}
                </span>
                <Calendar
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
            </button>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    role="dialog"
                    aria-label={ariaLabel ?? 'Choose date'}
                    style={{
                        left: menuPosition.left,
                        top: menuPosition.top,
                        width: menuPosition.width,
                    }}
                    className="fixed z-50 rounded-xl border border-border-default bg-bg-elevated p-3 text-sm shadow-subtle"
                >
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <button type="button" className="btn-ghost h-8 min-h-8 px-2" onClick={() => changeMonth(-1)} aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <p className="font-semibold text-text-primary">{monthLabel}</p>
                        <button type="button" className="btn-ghost h-8 min-h-8 px-2" onClick={() => changeMonth(1)} aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <span key={day} className="py-1">{day}</span>
                        ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                        {weeks.map((date) => {
                            const inputDate = formatInputDate(date);
                            const isSelected = value === inputDate;
                            const isOutsideMonth = date.getMonth() !== viewDate.getMonth();
                            const isToday = inputDate === getTodayInputDate();

                            return (
                                <button
                                    key={inputDate}
                                    type="button"
                                    onClick={() => chooseDate(date)}
                                    className={cn(
                                        'grid size-9 place-items-center rounded-full text-sm transition-colors',
                                        isSelected
                                            ? 'bg-action-primary text-action-primary-text'
                                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                                        isOutsideMonth && !isSelected && 'text-text-muted/50',
                                        isToday && !isSelected && 'ring-1 ring-border-strong'
                                    )}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 flex justify-end border-t border-border-subtle pt-3">
                        <button type="button" className="btn-ghost h-8 min-h-8 px-3" onClick={jumpToToday}>
                            Today
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
