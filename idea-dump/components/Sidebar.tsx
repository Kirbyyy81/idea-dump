'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Settings,
    Plus,
    Search,
    X,
    Folder,
    Lightbulb,
    FileText,
    Code,
    CheckCircle,
    Archive
} from 'lucide-react';

const statusIconMap = {
    Lightbulb,
    FileText,
    Code,
    CheckCircle,
    Archive,
};

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
            className="w-64 h-screen fixed left-0 top-0 flex flex-col"
            style={{
                background: 'var(--bg-elevated)',
                borderRight: '1px solid var(--border-default)'
            }}
        >
            {/* Logo */}
            <div
                className="p-6"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Folder size={24} style={{ color: 'var(--accent-rose)' }} />
                    <span
                        className="font-bold text-xl"
                        style={{
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--text-primary)'
                        }}
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
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors'
                        )}
                        style={{
                            background: pathname === '/dashboard' ? 'rgba(227, 112, 131, 0.1)' : 'transparent',
                            color: pathname === '/dashboard' ? 'var(--accent-rose)' : 'var(--text-secondary)'
                        }}
                    >
                        <LayoutDashboard size={18} />
                        Dashboard
                    </Link>
                </div>

                {/* Status Filters */}
                <div className="mb-6">
                    <h3
                        className="text-xs font-semibold uppercase tracking-wider mb-3 px-3"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        Status
                    </h3>
                    <div className="space-y-1">
                        <button
                            onClick={() => onStatusChange('all')}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                            style={{
                                background: selectedStatus === 'all' ? 'var(--bg-hover)' : 'transparent',
                                color: selectedStatus === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)'
                            }}
                        >
                            All Projects
                        </button>
                        {(Object.keys(statusConfig) as Status[]).map((status) => {
                            const IconComponent = statusIconMap[statusConfig[status].icon as keyof typeof statusIconMap];
                            return (
                                <button
                                    key={status}
                                    onClick={() => onStatusChange(status)}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                                    style={{
                                        background: selectedStatus === status ? 'var(--bg-hover)' : 'transparent',
                                        color: selectedStatus === status ? 'var(--text-primary)' : 'var(--text-secondary)'
                                    }}
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
                className="p-4 space-y-2"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
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
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{
                        background: pathname === '/settings' ? 'var(--bg-hover)' : 'transparent',
                        color: pathname === '/settings' ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                >
                    <Settings size={18} />
                    Settings
                </Link>
            </div>
        </aside>
    );
}
