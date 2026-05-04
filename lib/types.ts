// Database types matching Supabase schema

export type Status = 'ideation' | 'development' | 'deployed' | 'archived';

export type Priority = 'low' | 'medium' | 'high';

export interface Project {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    prd_content: string | null;
    github_url: string | null;
    deploy_url?: string | null;
    priority: Priority;
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
    if (project.deploy_url) return 'deployed';
    if (project.github_url) return 'development';
    return 'ideation';
}

// Status display configuration - using icon names instead of emojis
export const statusConfig: Record<Status, { label: string; color: string; icon: string }> = {
    ideation: { label: 'Ideation', color: 'var(--status-idea)', icon: 'Lightbulb' },
    development: { label: 'Development', color: 'var(--status-dev)', icon: 'Code' },
    deployed: { label: 'Deployed', color: 'var(--status-deployed)', icon: 'Rocket' },
    archived: { label: 'Archived', color: 'var(--status-archived)', icon: 'Archive' },
};

export const priorityConfig: Record<Priority, { label: string; color: string; textClass: string; indicatorClass: string }> = {
    low: { label: 'Low', color: 'var(--text-muted)', textClass: 'text-text-muted', indicatorClass: 'bg-text-muted' },
    medium: { label: 'Medium', color: 'var(--accent-apricot)', textClass: 'text-accent-apricot', indicatorClass: 'bg-accent-apricot' },
    high: { label: 'High', color: 'var(--accent-rose)', textClass: 'text-accent-rose', indicatorClass: 'bg-accent-rose' },
};

// Form types
export interface CreateProjectInput {
    title: string;
    description?: string;
    prd_content?: string;
    github_url?: string;
    deploy_url?: string;
    priority?: Priority;
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
}

// Daily Log types
export type LogSource = 'agent' | 'human';

export interface DailyLogContent {
    date: string;
    day?: string;
    operation_task?: string;
    tools_used?: string;
    lesson_learned?: string;
}

export interface DailyLogEntry {
    id: string;
    user_id: string;
    source: LogSource;
    content: DailyLogContent;
    effective_date: string;
    created_at: string;
    updated_at: string;
}

export interface CreateDailyLogInput {
    content: DailyLogContent;
    effective_date?: string;
}

export interface UpdateDailyLogInput {
    content: DailyLogContent;
    allow_human_overwrite?: boolean;
}

export type TicketStatus = 'todo' | 'in_progress' | 'to_review' | 'done' | 'closed';
export type TicketSource = 'self' | 'user_tester';

export interface Ticket {
    id: string;
    project_id: string;
    user_id: string;
    title: string;
    description: string | null;
    notes: string | null;
    status: TicketStatus;
    priority: Priority;
    source: TicketSource;
    tags: string[];
    created_at: string;
    updated_at: string;
}

export interface CreateTicketInput {
    project_id: string;
    title: string;
    description?: string;
    notes?: string;
    status?: TicketStatus;
    priority?: Priority;
    source?: TicketSource;
    tags?: string[];
}

export interface UpdateTicketInput {
    title?: string;
    description?: string;
    notes?: string;
    status?: TicketStatus;
    priority?: Priority;
    source?: TicketSource;
    tags?: string[];
}

export const ticketStatusConfig: Record<TicketStatus, { label: string; color: string }> = {
    todo: { label: 'To Do', color: 'var(--text-muted)' },
    in_progress: { label: 'In Progress', color: 'var(--accent-blue)' },
    to_review: { label: 'To Review', color: 'var(--accent-apricot)' },
    done: { label: 'Done', color: 'var(--accent-sage)' },
    closed: { label: 'Closed', color: 'var(--status-archived)' },
};

export const ticketSourceConfig: Record<TicketSource, { label: string }> = {
    self: { label: 'Self' },
    user_tester: { label: 'User/Tester' },
};
