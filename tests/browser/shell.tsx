import type { ReactNode } from 'react';
export function AppShell({ children, pageTitle, headerAction, contentClassName }: { children: ReactNode; pageTitle: string; headerAction: ReactNode; contentClassName: string }) {
    return <main className={contentClassName}><header className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{pageTitle}</h1>{headerAction}</header>{children}</main>;
}
