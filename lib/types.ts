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
    revoked_at: string | null;
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
    low: { label: 'Low', color: 'var(--border-strong)', textClass: 'text-text-primary', indicatorClass: 'bg-border-strong' },
    medium: { label: 'Medium', color: 'var(--warning)', textClass: 'text-warning', indicatorClass: 'bg-warning' },
    high: { label: 'High', color: 'var(--error)', textClass: 'text-error', indicatorClass: 'bg-error' },
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
    user_id: string | null;
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
    | 'SHOOTING'
    | 'PROCESSING'
    | 'PROCESSED';

export type FilmFormat = '35mm' | '120' | 'Large Format';

export type FilmType = 'NEGATIVE' | 'REVERSAL' | 'BW_NEGATIVE';

export type FilmProcessType = 'C41' | 'E6' | 'BW' | 'ECN2';

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
    film_type: FilmType;
    process_type: FilmProcessType | null;
    iso: number;
    status: FilmRollStatus;
    purchase_price: number;
    lab_name: string | null;
    processing_cost: number;
    scanning_cost: number;
    shipping_cost: number;
    processing_date: string | null;
    location_name: string | null;
    frames_taken: number;
    successful_photos: number;
    notes: string | null;
    drive_folder_id: string | null;
    cover_photo_id: string | null;
    cover_image_url: string | null;
    cover_image_path: string | null;
    created_at: string;
    updated_at: string;
    camera?: FilmCamera | null;
    cover_photo?: FilmPhoto | null;
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
    film_type?: FilmType;
    process_type?: FilmProcessType | null;
    iso: number;
    camera_id?: string;
    status?: FilmRollStatus;
    purchase_price?: number;
    lab_name?: string;
    processing_cost?: number;
    scanning_cost?: number;
    shipping_cost?: number;
    processing_date?: string;
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
    status_breakdown: Array<{
        status: FilmRollStatus;
        label: string;
        count: number;
        percentage: number;
    }>;
    cost_breakdown: Array<{
        key: 'film' | 'processing' | 'scanning' | 'shipping' | 'maintenance';
        label: string;
        amount: number;
    }>;
    format_breakdown: Array<{
        format: FilmFormat;
        label: string;
        count: number;
        percentage: number;
    }>;
    camera_usage: Array<{
        camera_id: string | null;
        camera: FilmCamera | null;
        label: string;
        roll_count: number;
        latest_roll_at: string | null;
    }>;
    activity_trend: Array<{
        month: string;
        label: string;
        roll_count: number;
        frames_taken: number;
        spend: number;
    }>;
    recent_rolls: FilmRoll[];
}

export const filmRollStatusConfig: Record<FilmRollStatus, { label: string; colorClass: string }> = {
    UNUSED: { label: 'Unused', colorClass: 'bg-bg-hover text-text-secondary border-border-default' },
    SHOOTING: { label: 'Shooting', colorClass: 'bg-accent-apricot/20 text-text-primary border-accent-apricot' },
    PROCESSING: { label: 'Processing', colorClass: 'bg-accent-rose/10 text-accent-rose border-accent-rose/40' },
    PROCESSED: { label: 'Processed', colorClass: 'bg-accent-sage/20 text-text-primary border-accent-sage' },
};

export const filmFormats: FilmFormat[] = ['35mm', '120', 'Large Format'];

export const filmTypeConfig: Record<FilmType, { label: string }> = {
    NEGATIVE: { label: 'Film negative' },
    REVERSAL: { label: 'Reversal film' },
    BW_NEGATIVE: { label: 'B&W negative' },
};

export const filmProcessTypeConfig: Record<FilmProcessType, { label: string }> = {
    C41: { label: 'C-41' },
    E6: { label: 'E-6' },
    BW: { label: 'B&W' },
    ECN2: { label: 'ECN-2' },
};

export const filmTypes: FilmType[] = ['NEGATIVE', 'REVERSAL', 'BW_NEGATIVE'];

export const filmProcessTypes: FilmProcessType[] = ['C41', 'E6', 'BW', 'ECN2'];

export type FinanceCategoryType = 'expense' | 'income';
export type FinanceTransactionDirection = 'expense' | 'income';
export type FinanceTransactionSource = 'manual' | 'screenshot';
export type FinanceTransactionStatus = 'confirmed' | 'review' | 'duplicate' | 'rejected';
export type FinanceCurrency = 'MYR';
export type FinanceDuplicateOutcome = 'none' | 'possible' | 'strong';
export type FinanceDuplicateSignal =
    | 'image_hash'
    | 'ocr_text_hash'
    | 'reference_number'
    | 'amount'
    | 'transaction_date'
    | 'source'
    | 'merchant';

export interface FinanceSource {
    id: string;
    user_id: string;
    name: string;
    filename_aliases: string[];
    ocr_aliases: string[];
    is_archived: boolean;
    created_at: string;
    updated_at: string;
}

export interface FinanceCategory {
    id: string;
    user_id: string;
    name: string;
    type: FinanceCategoryType;
    color: string | null;
    icon: string | null;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
}

export interface FinanceTransaction {
    id: string;
    user_id: string;
    source_id: string;
    category_id: string | null;
    intake_item_id: string | null;
    direction: FinanceTransactionDirection;
    amount: number;
    currency: FinanceCurrency;
    merchant: string | null;
    reference_number: string | null;
    transaction_date: string;
    notes: string | null;
    source: FinanceTransactionSource;
    status: FinanceTransactionStatus;
    created_at: string;
    updated_at: string;
    finance_source?: FinanceSource | null;
    category?: FinanceCategory | null;
}

export interface FinanceDashboardSummary {
    month: string;
    total_expense: number;
    total_income: number;
    net_cash_flow: number;
    review_count: number;
    recent_transactions: FinanceTransaction[];
    expense_by_category: Array<{
        category_id: string | null;
        label: string;
        amount: number;
    }>;
    daily_cash_flow: Array<{
        date: string;
        label: string;
        income: number;
        expense: number;
    }>;
}

export type FinanceIntakeStatus =
    | 'pending'
    | 'processing'
    | 'review'
    | 'completed'
    | 'duplicate'
    | 'failed'
    | 'rejected';

export interface FinanceIntakeItem {
    id: string;
    user_id: string;
    source: 'screenshot' | 'notification';
    status: FinanceIntakeStatus;
    image_hash: string | null;
    original_filename: string | null;
    detected_source_id: string | null;
    source_detection_signals: FinanceSourceDetectionSignal[];
    ocr_text: string | null;
    ocr_raw_text: string | null;
    ocr_normalized_text: string | null;
    ocr_confidence: number | null;
    ocr_text_hash: string | null;
    normalizer_version: number | null;
    received_at: string;
    processed_at: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface FinanceCandidatePayload {
    amount: number | null;
    currency: FinanceCurrency;
    merchant: string | null;
    direction: FinanceTransactionDirection | null;
    transaction_date: string | null;
    source_id: string | null;
    category_id: string | null;
    reference_number: string | null;
    /** Compatibility key retained for candidates created before the OCR contract migration. */
    reference?: string | null;
    matched_rule_names: string[];
    duplicate_transaction_id: string | null;
}

export interface FinanceCandidateTransaction {
    id: string;
    user_id: string;
    intake_item_id: string;
    payload: FinanceCandidatePayload;
    confidence: number | null;
    matched_rule_id: string | null;
    confirmed_transaction_id: string | null;
    duplicate_outcome: FinanceDuplicateOutcome;
    duplicate_score: number | null;
    duplicate_signals: FinanceDuplicateSignal[];
    duplicate_explanation: string | null;
    duplicate_checked_at: string | null;
    status: 'pending' | 'accepted' | 'rejected' | 'duplicate';
    created_at: string;
    updated_at: string;
    intake?: FinanceIntakeItem | null;
    duplicate_transaction?: FinanceTransaction | null;
}

export interface FinanceRule {
    id: string;
    user_id: string;
    name: string;
    match_type: 'exact_phrase' | 'merchant_alias' | 'keyword' | 'account_hint';
    pattern: string;
    category_id: string | null;
    source_id: string | null;
    direction: FinanceTransactionDirection | null;
    priority: number;
    is_active: boolean;
    source: 'manual' | 'learning';
    auto_created_at: string | null;
    learning_evidence_count: number | null;
    created_at: string;
    updated_at: string;
}

export interface FinanceRuleSuggestion {
    id: string;
    user_id: string;
    name: string;
    pattern: string;
    match_type: FinanceRule['match_type'];
    category_id: string;
    source_id: string | null;
    direction: 'expense' | 'income';
    priority: number;
    evidence_count: number;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    updated_at: string;
    category?: FinanceCategory | null;
    finance_source?: FinanceSource | null;
}

export interface FinanceSourceDetectionSignal {
    source_id: string;
    source_name: string;
    kind: 'filename_alias' | 'ocr_alias';
    alias: string;
    score: number;
}
