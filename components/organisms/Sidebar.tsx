'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Settings,
    Plus,
    Folder,
    ChevronDown,
    ChevronRight,
    Search
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';

interface SidebarProps {
    projects: Project[];
}

export function Sidebar({
    projects,
}: SidebarProps) {
    const pathname = usePathname();
    const [isProjectsOpen, setIsProjectsOpen] = useState(true);
    const [projectSearch, setProjectSearch] = useState('');

    const filteredProjects = projects.filter(p =>
        p.title.toLowerCase().includes(projectSearch.toLowerCase())
    );

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

                {/* Projects Dropdown */}
                <div className="mb-6">
                    <button
                        onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors mb-2"
                    >
                        <span>Projects</span>
                        {isProjectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {isProjectsOpen && (
                        <div className="space-y-2">
                            {/* Optional Mini Search */}
                            <div className="px-2 mb-2">
                                <div className="relative">
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type="text"
                                        placeholder="Find..."
                                        value={projectSearch}
                                        onChange={(e) => setProjectSearch(e.target.value)}
                                        className="w-full pl-7 pr-2 py-1 text-xs bg-bg-base border border-border-subtle rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-rose"
                                    />
                                </div>
                            </div>

                            <div className="space-y-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {filteredProjects.length === 0 ? (
                                    <p className="px-3 py-1.5 text-xs text-text-muted italic">
                                        {projects.length === 0 ? "No projects yet" : "No matches"}
                                    </p>
                                ) : (
                                    filteredProjects.map((project) => (
                                        <Link
                                            key={project.id}
                                            href={`/project/${project.id}`}
                                            className="block"
                                        >
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    "w-full justify-start text-sm py-1.5 h-8 font-normal truncate",
                                                    pathname === `/project/${project.id}`
                                                        ? "bg-bg-hover text-text-primary"
                                                        : "text-text-secondary hover:text-text-primary"
                                                )}
                                            >
                                                <span className="truncate">{project.title}</span>
                                            </Button>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
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
