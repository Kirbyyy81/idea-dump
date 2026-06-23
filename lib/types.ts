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

export type FilmRollStatus =
    | 'UNUSED'
    | 'LOADED'
    | 'SHOOTING'
    | 'AWAITING_PROCESSING'
    | 'PROCESSING'
    | 'PROCESSED'
    | 'ARCHIVED';

export type FilmFormat = '35mm' | '120' | 'Large Format';

export interface FilmCamera {
    id: string;
    user_id: string;
    name: string;
    brand: string | null;
    model: string | null;
    purchase_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface FilmProcessingRecord {
    id: string;
    user_id: string;
    film_roll_id: string;
    lab_name: string | null;
    processing_cost: number;
    scanning_cost: number;
    shipping_cost: number;
    processing_date: string | null;
    created_at: string;
    updated_at: string;
}

export interface FilmMaintenanceRecord {
    id: string;
    user_id: string;
    camera_id: string;
    service_date: string | null;
    service_type: string | null;
    provider_name: string | null;
    maintenance_cost: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface FilmPhoto {
    id: string;
    user_id: string;
    film_roll_id: string;
    drive_file_id: string;
    name: string;
    mime_type: string;
    web_view_link: string | null;
    thumbnail_link: string | null;
    width: number | null;
    height: number | null;
    is_favorite: boolean;
    synced_at: string;
    created_at: string;
    updated_at: string;
}

export interface FilmRoll {
    id: string;
    user_id: string;
    camera_id: string | null;
    film_name: string;
    brand: string;
    format: FilmFormat;
    iso: number;
    status: FilmRollStatus;
    purchase_price: number;
    location_name: string | null;
    frames_taken: number;
    successful_photos: number;
    notes: string | null;
    drive_folder_id: string | null;
    cover_photo_id: string | null;
    created_at: string;
    updated_at: string;
    camera?: FilmCamera | null;
    processing_records?: FilmProcessingRecord[];
    photos?: FilmPhoto[];
}

export interface CreateFilmCameraInput {
    name: string;
    brand?: string;
    model?: string;
    purchase_date?: string;
    notes?: string;
}

export interface UpdateFilmCameraInput extends Partial<CreateFilmCameraInput> {
    id: string;
}

export interface CreateFilmRollInput {
    film_name: string;
    brand: string;
    format: FilmFormat;
    iso: number;
    camera_id?: string;
    status?: FilmRollStatus;
    purchase_price?: number;
    location_name?: string;
    frames_taken?: number;
    successful_photos?: number;
    notes?: string;
    drive_folder_id?: string;
    cover_photo_id?: string | null;
}

export interface UpdateFilmRollInput extends Partial<CreateFilmRollInput> {
    id: string;
}

export interface CreateFilmProcessingInput {
    film_roll_id: string;
    lab_name?: string;
    processing_cost?: number;
    scanning_cost?: number;
    shipping_cost?: number;
    processing_date?: string;
}

export interface UpdateFilmProcessingInput extends Partial<CreateFilmProcessingInput> {
    id: string;
}

export interface CreateFilmMaintenanceInput {
    camera_id: string;
    service_date?: string;
    service_type?: string;
    provider_name?: string;
    maintenance_cost?: number;
    notes?: string;
}

export interface UpdateFilmMaintenanceInput extends Partial<CreateFilmMaintenanceInput> {
    id: string;
}

export interface UpdateFilmPhotoInput {
    id: string;
    film_roll_id?: string;
    is_favorite?: boolean;
    set_as_cover?: boolean;
}

export interface FilmDashboardSummary {
    total_pictures_taken: number;
    total_money_spent: number;
    total_cameras: number;
    total_rolls: number;
    processed_rolls: number;
    unprocessed_rolls: number;
    favorite_photos: number;
    average_spend_per_roll: number;
    maintenance_cost: number;
    total_photos: number;
    successful_photos: number;
    average_cost_per_photo: number;
    rolls_loaded_or_shooting: number;
    latest_camera_added: FilmCamera | null;
    cameras_with_maintenance_records: number;
    most_used_camera: FilmCamera | null;
}

export const filmRollStatusConfig: Record<FilmRollStatus, { label: string; colorClass: string }> = {
    UNUSED: { label: 'Unused', colorClass: 'bg-bg-hover text-text-secondary border-border-default' },
    LOADED: { label: 'Loaded', colorClass: 'bg-accent-blue/10 text-accent-blue border-accent-blue/40' },
    SHOOTING: { label: 'Shooting', colorClass: 'bg-accent-apricot/20 text-text-primary border-accent-apricot' },
    AWAITING_PROCESSING: { label: 'Awaiting Processing', colorClass: 'bg-accent-coral/10 text-accent-rose border-accent-coral' },
    PROCESSING: { label: 'Processing', colorClass: 'bg-accent-rose/10 text-accent-rose border-accent-rose/40' },
    PROCESSED: { label: 'Processed', colorClass: 'bg-accent-sage/20 text-text-primary border-accent-sage' },
    ARCHIVED: { label: 'Archived', colorClass: 'bg-bg-subtle text-text-muted border-border-default' },
};

export const filmFormats: FilmFormat[] = ['35mm', '120', 'Large Format'];
