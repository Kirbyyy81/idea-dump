'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    className?: string;
    buttonClassName?: string;
    menuClassName?: string;
    disabled?: boolean;
    ariaLabel?: string;
}

export function Select({
    value,
    onChange,
    options,
    placeholder = 'Select an option',
    className,
    buttonClassName,
    menuClassName,
    disabled,
    ariaLabel,
}: SelectProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 0 });
    const selectedIndex = options.findIndex((option) => option.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
    const enabledOptions = useMemo(
        () => options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled),
        [options]
    );

    useEffect(() => {
        if (!isOpen) return;

        function updateMenuPosition() {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;

            setMenuPosition({
                left: rect.left,
                top: rect.bottom + 4,
                width: rect.width,
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

    useEffect(() => {
        if (!isOpen) return;

        const nextIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
            ? selectedIndex
            : enabledOptions[0]?.index;

        if (nextIndex !== undefined) {
            requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
        }
    }, [enabledOptions, isOpen, options, selectedIndex]);

    const chooseOption = (option: SelectOption) => {
        if (option.disabled) return;
        onChange(option.value);
        setIsOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
    };

    const moveFocus = (currentIndex: number, direction: 1 | -1) => {
        if (enabledOptions.length === 0) return;

        const enabledPosition = enabledOptions.findIndex(({ index }) => index === currentIndex);
        const nextPosition = enabledPosition < 0
            ? 0
            : (enabledPosition + direction + enabledOptions.length) % enabledOptions.length;
        optionRefs.current[enabledOptions[nextPosition].index]?.focus();
    };

    const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen(true);
        }
    };

    const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: SelectOption, index: number) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            buttonRef.current?.focus();
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            chooseOption(option);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveFocus(index, 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveFocus(index, -1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            optionRefs.current[enabledOptions[0]?.index]?.focus();
        } else if (event.key === 'End') {
            event.preventDefault();
            optionRefs.current[enabledOptions[enabledOptions.length - 1]?.index]?.focus();
        }
    };

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
                onClick={() => setIsOpen((current) => !current)}
                onKeyDown={handleButtonKeyDown}
                className={cn(
                    'input flex h-10 items-center justify-between gap-2 pr-10 text-left',
                    disabled && 'cursor-not-allowed opacity-60',
                    buttonClassName
                )}
            >
                <span className={cn('truncate', !selectedOption && 'text-text-muted')}>
                    {selectedOption?.label ?? placeholder}
                </span>
                <ChevronDown
                    size={16}
                    className={cn(
                        'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-transform',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    style={{
                        left: menuPosition.left,
                        top: menuPosition.top,
                        width: menuPosition.width,
                    }}
                    className={cn(
                        'custom-scrollbar fixed z-50 max-h-64 overflow-y-auto rounded-md border border-border-default bg-bg-elevated py-1 text-sm shadow-subtle',
                        menuClassName
                    )}
                >
                    {options.map((option, index) => {
                        const isSelected = option.value === value;

                        return (
                            <button
                                key={`${option.value}-${index}`}
                                ref={(node) => {
                                    optionRefs.current[index] = node;
                                }}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                disabled={option.disabled}
                                onClick={() => chooseOption(option)}
                                onKeyDown={(event) => handleOptionKeyDown(event, option, index)}
                                className={cn(
                                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                                    isSelected ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary',
                                    option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-text-secondary'
                                )}
                            >
                                <span className="truncate">{option.label}</span>
                                {isSelected && <Check size={14} className="shrink-0 text-accent-rose" />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
