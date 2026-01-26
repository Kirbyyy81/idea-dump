// Database types matching Supabase schema

export type Status = 'idea' | 'prd' | 'in_development' | 'completed' | 'archived';

export type Priority = 'low' | 'medium' | 'high';

export interface Project {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    prd_content: string | null;
    github_url: string | null;
    priority: Priority;
    tags: string[];
    completed: boolean;
    archived: boolean;
    created_at: string;
    updated_at: string;
}

export interface Note {
    id: string;
    project_id: string;
    content: string;
    created_at: string;
}

export interface ApiKey {
    id: string;
    user_id: string;
    key_hash: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

// Status inference logic from PRD
export function inferStatus(project: Project): Status {
    if (project.archived) return 'archived';
    if (project.completed) return 'completed';
    if (project.github_url) return 'in_development';
    if (project.prd_content && project.prd_content.length > 500) return 'prd';
    return 'idea';
}

// Status display configuration
export const statusConfig: Record<Status, { label: string; color: string; icon: string }> = {
    idea: { label: 'Idea', color: 'var(--status-idea)', icon: '💡' },
    prd: { label: 'PRD', color: 'var(--status-prd)', icon: '📄' },
    in_development: { label: 'In Development', color: 'var(--status-dev)', icon: '🚧' },
    completed: { label: 'Completed', color: 'var(--status-complete)', icon: '✅' },
    archived: { label: 'Archived', color: 'var(--status-archived)', icon: '🗄️' },
};

export const priorityConfig: Record<Priority, { label: string; color: string }> = {
    low: { label: 'Low', color: 'var(--text-muted)' },
    medium: { label: 'Medium', color: 'var(--accent-apricot)' },
    high: { label: 'High', color: 'var(--accent-rose)' },
};

// Form types
export interface CreateProjectInput {
    title: string;
    description?: string;
    prd_content?: string;
    github_url?: string;
    priority?: Priority;
    tags?: string[];
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
    completed?: boolean;
    archived?: boolean;
}

export interface CreateNoteInput {
    project_id: string;
    content: string;
}

// API response types
export interface ApiResponse<T> {
    data: T | null;
    error: string | null;
}

// Ingest API types
export interface IngestPayload {
    title: string;
    description?: string;
    prd_content?: string;
    tags?: string[];
}
