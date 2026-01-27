'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Project, Note, inferStatus, priorityConfig, statusConfig, Status, Priority } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { NotesPanel } from '@/components/NotesPanel';
import { ArrowLeft, ExternalLink, Archive, Check, Pencil, FileText } from 'lucide-react';

// Demo data
const demoProject: Project = {
    id: '1',
    user_id: 'demo',
    title: 'IdeaDump',
    description: 'A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.',
    prd_content: `# IdeaDump - Personal PRD Management Hub

A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.

## Overview

**Problem**: PRDs are scattered across different locations, making it hard to track progress and pick up where you left off.

**Solution**: IdeaDump - a clean, personal hub where you can:
- Import and store all PRDs (markdown format)
- Track project status through defined stages
- Add notes/journal entries per project
- Link to GitHub repos
- Access from any device

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | shadcn/ui + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Magic Link |
| Hosting | Vercel |
`,
    github_url: 'https://github.com/user/ideadump',
    priority: 'high',
    tags: ['nextjs', 'supabase', 'productivity'],
    completed: false,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const demoNotes: Note[] = [
    {
        id: '1',
        project_id: '1',
        content: 'Finished Phase 1 setup. Moving to dashboard implementation.',
        created_at: new Date().toISOString(),
    },
    {
        id: '2',
        project_id: '1',
        content: 'Need to set up Supabase project and add environment variables.',
        created_at: new Date(Date.now() - 86400000).toISOString(),
    },
];

export default function ProjectPage() {
    const params = useParams();
    const [project, setProject] = useState<Project>(demoProject);
    const [notes, setNotes] = useState<Note[]>(demoNotes);
    const [isEditing, setIsEditing] = useState(false);

    const status = inferStatus(project);

    const handleAddNote = async (content: string) => {
        const newNote: Note = {
            id: Date.now().toString(),
            project_id: project.id,
            content,
            created_at: new Date().toISOString(),
        };
        setNotes([newNote, ...notes]);
    };

    const handleToggleComplete = () => {
        setProject((prev) => ({ ...prev, completed: !prev.completed }));
    };

    const handleToggleArchive = () => {
        setProject((prev) => ({ ...prev, archived: !prev.archived }));
    };

    return (
        <div className="min-h-screen p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowLeft size={20} />
                    Back to Dashboard
                </Link>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        onClick={handleToggleArchive}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Archive size={16} />
                        {project.archived ? 'Unarchive' : 'Archive'}
                    </button>
                </div>
            </div>

            {/* Project Header */}
            <div className="mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h1 style={{ color: 'var(--text-primary)' }}>{project.title}</h1>
                    <StatusBadge status={status} size="md" />
                </div>

                {project.description && (
                    <p
                        className="text-lg mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {project.description}
                    </p>
                )}

                {/* Meta Info */}
                <div
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)'
                    }}
                >
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Priority
                        </p>
                        <p className="font-medium" style={{ color: priorityConfig[project.priority].color }}>
                            {priorityConfig[project.priority].label}
                        </p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Created
                        </p>
                        <p style={{ color: 'var(--text-secondary)' }}>{formatDate(project.created_at)}</p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Updated
                        </p>
                        <p style={{ color: 'var(--text-secondary)' }}>{formatDate(project.updated_at)}</p>
                    </div>
                    <div>
                        <p
                            className="text-xs uppercase mb-1"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            GitHub
                        </p>
                        {project.github_url ? (
                            <a
                                href={project.github_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                                style={{ color: 'var(--accent-rose)' }}
                            >
                                <ExternalLink size={14} />
                                View Repo
                            </a>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>Not linked</p>
                        )}
                    </div>
                </div>

                {/* Tags */}
                {project.tags.length > 0 && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                        {project.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-sm px-3 py-1 rounded-full"
                                style={{
                                    background: 'var(--bg-hover)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Complete Toggle */}
                <button
                    onClick={handleToggleComplete}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                    style={{
                        background: project.completed ? 'var(--success-bg)' : 'var(--bg-hover)',
                        color: project.completed ? 'var(--status-complete)' : 'var(--text-secondary)'
                    }}
                >
                    <Check size={18} />
                    {project.completed ? 'Marked as Complete' : 'Mark as Complete'}
                </button>
            </div>

            {/* PRD Content */}
            {project.prd_content && (
                <section
                    className="mb-8 p-6 rounded-lg"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)'
                    }}
                >
                    <h2
                        className="text-xl font-semibold mb-4 flex items-center gap-2"
                        style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <FileText size={20} style={{ color: 'var(--accent-rose)' }} />
                        PRD
                    </h2>
                    <MarkdownRenderer content={project.prd_content} />
                </section>
            )}

            {/* Notes */}
            <section
                className="p-6 rounded-lg"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)'
                }}
            >
                <NotesPanel notes={notes} onAddNote={handleAddNote} />
            </section>
        </div>
    );
}
