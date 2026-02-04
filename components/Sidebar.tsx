'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { iconMap } from '@/lib/icons';
import {
    LayoutDashboard,
    Settings,
    Plus,
    Search,
    X,
    Folder
} from 'lucide-react';

interface SidebarProps {
    selectedStatus: Status | 'all';
    onStatusChange: (status: Status | 'all') => void;
}

export function Sidebar({
    selectedStatus,
    onStatusChange,
}: SidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className="w-64 h-screen fixed left-0 top-0 flex flex-col bg-bg-elevated border-r border-border-default"
        >
            {/* Logo */}
            <div
                className="p-6 border-b border-border-subtle"
            >
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Folder size={24} className="text-accent-rose" />
                    <span
                        className="font-bold text-xl font-heading text-text-primary"
                    >
                        IdeaDump
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
                {/* Main Links */}
                <div className="space-y-1 mb-6">
                    <Link
                        href="/dashboard"
                        className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                            pathname === '/dashboard'
                                ? 'bg-accent-rose/10 text-accent-rose'
                                : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        )}
                    >
                        <LayoutDashboard size={18} />
                        Dashboard
                    </Link>
                </div>

                {/* Status Filters */}
                <div className="mb-6">
                    <h3
                        className="text-xs font-semibold uppercase tracking-wider mb-3 px-3 text-text-muted"
                    >
                        Status
                    </h3>
                    <div className="space-y-1">
                        <button
                            onClick={() => onStatusChange('all')}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                                selectedStatus === 'all'
                                    ? 'bg-bg-hover text-text-primary'
                                    : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                            )}
                        >
                            All Projects
                        </button>
                        {(Object.keys(statusConfig) as Status[]).map((status) => {
                            const IconComponent = iconMap[statusConfig[status].icon];
                            return (
                                <button
                                    key={status}
                                    onClick={() => onStatusChange(status)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                                        selectedStatus === status
                                            ? 'bg-bg-hover text-text-primary'
                                            : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                                    )}
                                >
                                    {IconComponent && <IconComponent size={16} />}
                                    {statusConfig[status].label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* Footer */}
            <div
                className="p-4 space-y-2 border-t border-border-subtle"
            >
                <Link
                    href="/dashboard?new=true"
                    className="btn-primary w-full flex items-center justify-center gap-2"
                >
                    <Plus size={18} />
                    New Project
                </Link>
                <Link
                    href="/settings"
                    className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                        pathname === '/settings'
                            ? 'bg-bg-hover text-text-primary'
                            : 'bg-transparent text-text-secondary hover:bg-bg-hover'
                    )}
                >
                    <Settings size={18} />
                    Settings
                </Link>
            </div>
        </aside>
    );
}
