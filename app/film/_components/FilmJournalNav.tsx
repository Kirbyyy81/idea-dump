'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Camera, Film, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
    { href: '/film', label: 'Film Shelf', icon: Film, exact: true },
    { href: '/film/new-roll', label: 'Add Roll', icon: Plus },
    { href: '/film/cameras', label: 'Cameras', icon: Camera },
    { href: '/film/dashboard', label: 'Dashboard', icon: BarChart3 },
];

export function FilmJournalNav() {
    const pathname = usePathname();

    return (
        <nav aria-label="Film Journal" className="flex flex-wrap gap-2">
            {items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                            active
                                ? 'border-text-primary bg-text-primary text-bg-base'
                                : 'border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary'
                        )}
                    >
                        <Icon size={15} />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
