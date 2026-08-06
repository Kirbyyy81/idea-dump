'use client';

import { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { LoaderOne } from '@/components/atoms/Loader';
import { PageHeader } from '@/components/molecules/PageHeader';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { findModuleRouteRule } from '@/lib/rbac/routes';
import { useAccess } from '@/lib/contexts/AccessContext';
import { PUBLIC_AUTH_PATH_PREFIXES } from '@/lib/auth/routes';
import { listProjects } from '@/lib/projects/core/client';

interface AppShellProps extends PropsWithChildren {
    contentClassName?: string;
    headerAction?: ReactNode;
    headerClassName?: string;
    projects?: Project[];
    isLoading?: boolean;
    loadingMessage?: string;
    pageTitle?: string;
    persistent?: boolean;
}

interface ShellContextValue {
    setProjects: (projects: Project[]) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

function matchesPath(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function ShellContent({
    children,
    headerAction,
    headerClassName,
    isLoading,
    loadingMessage,
    pageTitle,
}: PropsWithChildren<Pick<AppShellProps, 'headerAction' | 'headerClassName' | 'isLoading' | 'loadingMessage' | 'pageTitle'>>) {
    if (!isLoading) {
        return (
            <>
                {pageTitle && <PageHeader title={pageTitle} action={headerAction} className={headerClassName} />}
                {children}
            </>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
            <LoaderOne size="lg" />
            {loadingMessage && (
                <p className="animate-pulse text-sm text-text-muted">{loadingMessage}</p>
            )}
        </div>
    );
}

export function AppShell({
    children,
    contentClassName = 'p-5 md:p-6',
    headerAction,
    headerClassName,
    projects: externalProjects,
    isLoading,
    loadingMessage,
    pageTitle,
    persistent = false,
}: AppShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const access = useAccess();
    const parentShell = useContext(ShellContext);
    const [internalProjects, setInternalProjects] = useState<Project[]>([]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const mobileNavRef = useRef<HTMLDivElement>(null);
    const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
    const mobileNavId = `mobile-navigation-${useId()}`;
    const isPublicPath = PUBLIC_AUTH_PATH_PREFIXES.some((prefix) => matchesPath(pathname, prefix));
    const routeRule = findModuleRouteRule(pathname);
    const isAccessDenied = Boolean(
        persistent &&
        access &&
        routeRule &&
        (
            !access.allowedModules.includes(routeRule.module) ||
            (routeRule.requiresManager && !access.canManageAccess)
        )
    );
    const shellContextValue = useMemo<ShellContextValue>(
        () => ({ setProjects: setInternalProjects }),
        []
    );

    useEffect(() => {
        if (!persistent || isPublicPath || !access?.allowedModules.includes('projects')) return;

        let cancelled = false;

        async function fetchProjects() {
            try {
                const projects = await listProjects();
                if (!cancelled) {
                    setInternalProjects(projects);
                }
            } catch {
                // Project navigation is best-effort when the user lacks Projects access.
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, [access, isPublicPath, persistent]);

    useEffect(() => {
        if (persistent || !parentShell || externalProjects === undefined) return;
        parentShell.setProjects(externalProjects);
    }, [externalProjects, parentShell, persistent]);

    useEffect(() => {
        if (!isAccessDenied || !access) return;
        router.replace(access.modules[0]?.path ?? '/settings');
    }, [access, isAccessDenied, router]);

    const projects = persistent
        ? internalProjects
        : externalProjects !== undefined
            ? externalProjects
            : internalProjects;

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

    if (persistent && isPublicPath) {
        return children;
    }

    if (persistent && (!access || isAccessDenied)) {
        return null;
    }

    if (!persistent && parentShell) {
        return (
            <div className={cn('min-w-0', contentClassName)}>
                <ShellContent
                    headerAction={headerAction}
                    headerClassName={headerClassName}
                    isLoading={isLoading}
                    loadingMessage={loadingMessage}
                    pageTitle={pageTitle}
                >
                    {children}
                </ShellContent>
            </div>
        );
    }

    return (
        <ShellContext.Provider value={shellContextValue}>
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
                        aria-expanded={isMobileNavOpen}
                        aria-controls={mobileNavId}
                    >
                        <Menu size={20} />
                    </button>
                </header>

                <div aria-hidden={isMobileNavOpen || undefined} className="hidden self-stretch md:block">
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
                            id={mobileNavId}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Mobile navigation"
                            className="absolute inset-y-0 left-0 w-[min(86vw,292px)]"
                        >
                            <button
                                type="button"
                                onClick={closeMobileNav}
                                className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-sm text-nav-text-muted transition-colors hover:bg-nav-bg-hover hover:text-nav-text"
                                aria-label="Close navigation"
                            >
                                <X size={18} />
                            </button>
                            <Sidebar
                                projects={projects}
                                className="static h-dvh max-h-dvh rounded-none px-4 py-5"
                            />
                        </div>
                    </div>
                )}

                <main
                    aria-hidden={isMobileNavOpen || undefined}
                    className={cn('min-w-0 flex-1', !persistent && contentClassName)}
                >
                    {persistent ? (
                        children
                    ) : (
                        <ShellContent
                            headerAction={headerAction}
                            headerClassName={headerClassName}
                            isLoading={isLoading}
                            loadingMessage={loadingMessage}
                            pageTitle={pageTitle}
                        >
                            {children}
                        </ShellContent>
                    )}
                </main>
            </div>
        </div>
        </ShellContext.Provider>
    );
}
