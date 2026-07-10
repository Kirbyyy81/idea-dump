'use client';

import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { LoaderOne } from '@/components/atoms/Loader';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AppShellProps extends PropsWithChildren {
    contentClassName?: string;
    projects?: Project[];
    isLoading?: boolean;
    loadingMessage?: string;
}

export function AppShell({ children, contentClassName = 'p-5 md:p-6', projects: externalProjects, isLoading, loadingMessage }: AppShellProps) {
    const pathname = usePathname();
    const [internalProjects, setInternalProjects] = useState<Project[]>([]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const mobileNavRef = useRef<HTMLDivElement>(null);
    const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);

    // Only fetch projects internally if external projects not provided
    useEffect(() => {
        // Skip fetching if projects provided externally
        if (externalProjects !== undefined) {
            return;
        }

        let cancelled = false;

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok || cancelled) return;

                const payload = await res.json();
                if (!cancelled) {
                    setInternalProjects(payload.data || []);
                }
            } catch {
                // Project navigation is best-effort when the user lacks Projects access.
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, [externalProjects]);

    // Use external projects if provided, otherwise use internal projects
    const projects = externalProjects !== undefined ? externalProjects : internalProjects;

    const closeMobileNav = () => {
        setIsMobileNavOpen(false);
        requestAnimationFrame(() => mobileNavTriggerRef.current?.focus());
    };

    useEffect(() => {
        if (isMobileNavOpen) closeMobileNav();
        // Navigation changes should dismiss the mobile drawer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    useEffect(() => {
        if (!isMobileNavOpen) return;

        const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusFirst = () => mobileNavRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
        requestAnimationFrame(focusFirst);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMobileNav();
                return;
            }
            if (event.key !== 'Tab' || !mobileNavRef.current) return;

            const focusable = Array.from(mobileNavRef.current.querySelectorAll<HTMLElement>(focusableSelector));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isMobileNavOpen]);

    useEffect(() => {
        if (!isMobileNavOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isMobileNavOpen]);

    return (
        <div className="min-h-screen bg-bg-canvas font-body text-text-primary md:p-3">
            <div
                className={cn(
                    'mx-auto flex min-h-screen max-w-[1540px] flex-col bg-bg-shell md:grid md:min-h-[calc(100vh-24px)] md:items-start md:gap-3 md:rounded-shell md:border-2 md:border-border-strong md:p-3 md:transition-[grid-template-columns]',
                    isSidebarCollapsed
                        ? 'md:grid-cols-[64px_minmax(0,1fr)]'
                        : 'md:grid-cols-[224px_minmax(0,1fr)]'
                )}
            >
                <header aria-hidden={isMobileNavOpen || undefined} className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-default bg-bg-shell px-4 md:hidden">
                    <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
                        <Image
                            src="/logo.png"
                            alt="IdeaDump Logo"
                            width={28}
                            height={28}
                            className="size-7 shrink-0 object-contain"
                        />
                        <span className="truncate font-heading text-base font-extrabold leading-none text-text-primary">
                            IdeaDump
                        </span>
                    </Link>
                    <button
                        ref={mobileNavTriggerRef}
                        type="button"
                        onClick={() => setIsMobileNavOpen(true)}
                        className="grid size-10 place-items-center rounded-sm border border-border-default text-text-primary transition-colors hover:bg-bg-hover"
                        aria-label="Open navigation"
                    >
                        <Menu size={20} />
                    </button>
                </header>

                <div aria-hidden={isMobileNavOpen || undefined} className="hidden md:block">
                    <Sidebar
                        projects={projects}
                        collapsed={isSidebarCollapsed}
                        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
                    />
                </div>

                {isMobileNavOpen && (
                    <div className="fixed inset-0 z-40 md:hidden">
                        <button
                            type="button"
                            className="absolute inset-0 bg-overlay-backdrop"
                            onClick={closeMobileNav}
                            aria-label="Close navigation"
                            aria-hidden="true"
                            tabIndex={-1}
                        />
                        <div
                            ref={mobileNavRef}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Mobile navigation"
                            className="absolute inset-y-0 left-0 w-[min(86vw,292px)]"
                        >
                            <button
                                type="button"
                                onClick={closeMobileNav}
                                className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-sm text-nav-text-muted transition-colors hover:bg-nav-bg-hover hover:text-nav-text"
                                aria-label="Close navigation"
                            >
                                <X size={18} />
                            </button>
                            <Sidebar
                                projects={projects}
                                className="static h-dvh max-h-dvh rounded-none px-4 py-5 pr-14"
                            />
                        </div>
                    </div>
                )}

                <main aria-hidden={isMobileNavOpen || undefined} className={cn('min-w-0 flex-1', contentClassName)}>
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <LoaderOne size="lg" />
                            {loadingMessage && (
                                <p className="text-text-muted text-sm animate-pulse">{loadingMessage}</p>
                            )}
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>
        </div>
    );
}
