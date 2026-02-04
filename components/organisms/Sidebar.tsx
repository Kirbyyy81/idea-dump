'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Status, statusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { iconMap } from '@/lib/icons';
import { Button } from '@/components/atoms/Button';
import {
    LayoutDashboard,
    Settings,
    Plus,
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
            <div className="p-6 border-b border-border-subtle">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Folder size={24} className="text-accent-rose" />
                    <span className="font-bold text-xl font-heading text-text-primary">
                        IdeaDump
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
                {/* Main Links */}
                <div className="space-y-1 mb-6">
                    <Link href="/dashboard" className="block">
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start",
                                pathname === '/dashboard'
                                    ? "bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20 hover:text-accent-rose"
                                    : "text-text-secondary hover:text-text-primary"
                            )}
                            icon={<LayoutDashboard size={18} />}
                        >
                            Dashboard
                        </Button>
                    </Link>
                </div>

                {/* Status Filters */}
                <div className="mb-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-3 text-text-muted">
                        Status
                    </h3>
                    <div className="space-y-1">
                        <Button
                            variant="ghost"
                            onClick={() => onStatusChange('all')}
                            className={cn(
                                "w-full justify-start",
                                selectedStatus === 'all'
                                    ? "bg-bg-hover text-text-primary"
                                    : "text-text-secondary"
                            )}
                        >
                            All Projects
                        </Button>

                        {(Object.keys(statusConfig) as Status[]).map((status) => {
                            const IconComponent = iconMap[statusConfig[status].icon];
                            return (
                                <Button
                                    key={status}
                                    variant="ghost"
                                    onClick={() => onStatusChange(status)}
                                    className={cn(
                                        "w-full justify-start",
                                        selectedStatus === status
                                            ? "bg-bg-hover text-text-primary"
                                            : "text-text-secondary"
                                    )}
                                    icon={IconComponent && <IconComponent size={16} />}
                                >
                                    {statusConfig[status].label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* Footer */}
            <div className="p-4 space-y-2 border-t border-border-subtle">
                <Link href="/dashboard?new=true" className="block">
                    <Button variant="primary" className="w-full" icon={<Plus size={18} />}>
                        New Project
                    </Button>
                </Link>

                <Link href="/settings" className="block">
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start",
                            pathname === '/settings'
                                ? "bg-bg-hover text-text-primary"
                                : "text-text-secondary"
                        )}
                        icon={<Settings size={18} />}
                    >
                        Settings
                    </Button>
                </Link>
            </div>
        </aside>
    );
}
