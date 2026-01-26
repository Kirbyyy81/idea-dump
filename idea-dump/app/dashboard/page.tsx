'use client';

import { useState, useMemo } from 'react';
import { Project, Status, inferStatus } from '@/lib/types';
import { ProjectCard } from '@/components/ProjectCard';
import { Sidebar } from '@/components/Sidebar';
import { SearchBar } from '@/components/SearchBar';

// Demo data for initial display
const demoProjects: Project[] = [
    {
        id: '1',
        user_id: 'demo',
        title: 'IdeaDump',
        description: 'A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.',
        prd_content: '# IdeaDump PRD\n\nThis is a sample PRD with more than 500 characters to demonstrate the PRD status. The app allows users to import and store PRDs, track project status, add notes, and more. Built with Next.js and Supabase.',
        github_url: 'https://github.com/user/ideadump',
        priority: 'high',
        tags: ['nextjs', 'supabase', 'productivity'],
        completed: false,
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: '2',
        user_id: 'demo',
        title: 'SimplifyIt',
        description: 'Browser extension that simplifies complex content and extracts actionable items.',
        prd_content: '# SimplifyIt\n\nA browser extension for accessibility.',
        github_url: null,
        priority: 'medium',
        tags: ['chrome-extension', 'ai', 'accessibility'],
        completed: false,
        archived: false,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        id: '3',
        user_id: 'demo',
        title: 'Kaching-Kaching',
        description: 'AI-powered expense tracking with automated receipt scanning.',
        prd_content: null,
        github_url: null,
        priority: 'low',
        tags: ['mobile', 'ai', 'finance'],
        completed: false,
        archived: false,
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date(Date.now() - 172800000).toISOString(),
    },
];

export default function DashboardPage() {
    const [projects] = useState<Project[]>(demoProjects);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<Status | 'all'>('all');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Extract all unique tags
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        projects.forEach((p) => p.tags.forEach((t) => tags.add(t)));
        return Array.from(tags).sort();
    }, [projects]);

    // Filter projects
    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesTitle = project.title.toLowerCase().includes(query);
                const matchesDesc = project.description?.toLowerCase().includes(query);
                if (!matchesTitle && !matchesDesc) return false;
            }

            // Status filter
            if (selectedStatus !== 'all') {
                if (inferStatus(project) !== selectedStatus) return false;
            }

            // Tag filter
            if (selectedTags.length > 0) {
                const hasAllTags = selectedTags.every((tag) => project.tags.includes(tag));
                if (!hasAllTags) return false;
            }

            return true;
        });
    }, [projects, searchQuery, selectedStatus, selectedTags]);

    const handleTagToggle = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    return (
        <div className="min-h-screen">
            {/* Sidebar */}
            <Sidebar
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                selectedTags={selectedTags}
                onTagToggle={handleTagToggle}
                allTags={allTags}
            />

            {/* Main Content */}
            <main className="ml-64 p-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-text-primary">Projects</h1>
                        <p className="text-text-secondary mt-1">
                            {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="w-80">
                        <SearchBar onSearch={setSearchQuery} />
                    </div>
                </div>

                {/* Project Grid */}
                {filteredProjects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="text-4xl mb-4">🔍</div>
                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                            No projects found
                        </h3>
                        <p className="text-text-secondary">
                            Try adjusting your search or filters
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
