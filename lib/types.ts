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

export type FinanceTransactionDirection = 'expense' | 'income';
export type FinanceEntryMode = 'manual' | 'screenshot';
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

export interface FinanceReferenceOption {
    id: string;
    name: string;
}

export interface FinanceReferenceData {
    sources: FinanceReferenceOption[];
    categories: FinanceReferenceOption[];
}

export interface FinanceSourceDetail extends FinanceReferenceOption {
    filename_aliases: string[];
    ocr_aliases: string[];
    is_archived: boolean;
}

export interface FinanceCategoryDetail extends FinanceReferenceOption {
    is_archived: boolean;
}

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
    is_archived: boolean;
    created_at: string;
    updated_at: string;
}

export interface FinancePayee {
    id: string;
    user_id: string;
    name: string;
    normalized_name: string;
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
    manual_idempotency_key: string | null;
    direction: FinanceTransactionDirection;
    amount: number;
    currency: FinanceCurrency;
    merchant: string | null;
    payee_id: string | null;
    reference_number: string | null;
    transaction_date: string;
    notes: string | null;
    source: FinanceTransactionSource;
    status: FinanceTransactionStatus;
    created_at: string;
    updated_at: string;
    finance_source?: FinanceSource | null;
    category?: FinanceCategory | null;
    finance_payee?: FinancePayee | null;
}

export interface FinanceTransactionView {
    id: string;
    source_id: string;
    category_id: string | null;
    direction: FinanceTransactionDirection;
    amount: number;
    currency: FinanceCurrency;
    merchant: string | null;
    payee_id: string | null;
    reference_number: string | null;
    transaction_date: string;
    notes: string | null;
    created_at: string;
    finance_source?: FinanceReferenceOption | null;
    category?: FinanceCategoryDetail | null;
    finance_payee?: FinanceReferenceOption | null;
}

export interface FinanceDashboardRecentTransaction {
    id: string;
    direction: FinanceTransactionDirection;
    amount: number;
    merchant: string | null;
    transaction_date: string;
    finance_source?: Pick<FinanceReferenceOption, 'name'> | null;
    finance_payee?: Pick<FinanceReferenceOption, 'name'> | null;
}

export interface FinanceDashboardSummary {
    total_expense: number;
    total_income: number;
    net_cash_flow: number;
    recent_transactions: FinanceDashboardRecentTransaction[];
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
    processing_attempt_id: string | null;
    processing_started_at: string | null;
    processing_lease_expires_at: string | null;
    processing_attempt_count: number;
    processing_version: number;
    failure_code: string | null;
    failure_stage: string | null;
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
    payee_id: string | null;
    payee_name: string | null;
    direction: FinanceTransactionDirection | null;
    transaction_date: string | null;
    source_id: string | null;
    category_id: string | null;
    reference_number: string | null;
    notes: string | null;
    /** Compatibility key retained for candidates created before the OCR contract migration. */
    reference?: string | null;
    matched_rule_names: string[];
    learned_field_rule_ids?: string[];
    matched_parser_template_ids?: string[];
    parser_template_evaluations?: FinanceParserTemplateEvaluation[];
    parser_template_baseline?: FinanceParserTemplateBaseline;
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

export interface FinanceReviewIntake {
    ocr_text: string | null;
    ocr_raw_text: string | null;
    ocr_normalized_text: string | null;
    ocr_confidence: number | null;
    normalizer_version: number | null;
}

export interface FinanceReviewDuplicateTransaction {
    id: string;
    amount: number;
    currency: FinanceCurrency;
    merchant: string | null;
    transaction_date: string;
    finance_source?: Pick<FinanceReferenceOption, 'name'> | null;
    finance_payee?: Pick<FinanceReferenceOption, 'name'> | null;
}

export interface FinanceReviewCandidate {
    id: string;
    payload: FinanceCandidatePayload;
    confidence: number | null;
    duplicate_outcome: FinanceDuplicateOutcome;
    duplicate_signals: FinanceDuplicateSignal[];
    duplicate_explanation: string | null;
    intake?: FinanceReviewIntake | null;
    duplicate_transaction?: FinanceReviewDuplicateTransaction | null;
}

export type FinanceFailedIntake = Pick<
    FinanceIntakeItem,
    | 'id'
    | 'original_filename'
    | 'processing_attempt_count'
    | 'failure_code'
    | 'failure_stage'
    | 'error_message'
>;

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

export interface FinanceRuleView extends Pick<
    FinanceRule,
    | 'id'
    | 'name'
    | 'match_type'
    | 'pattern'
    | 'category_id'
    | 'source_id'
    | 'direction'
    | 'priority'
    | 'is_active'
    | 'source'
    | 'auto_created_at'
    | 'learning_evidence_count'
    | 'created_at'
> {
    finance_source?: Pick<FinanceReferenceOption, 'name'> | null;
    category?: Pick<FinanceReferenceOption, 'name'> | null;
}

export type FinanceLearnedFieldName = 'reference_number';

export type FinanceLearnedTransformType =
    | 'strip_prefix'
    | 'strip_suffix'
    | 'digits_only'
    | 'alphanumeric_only';

export interface FinanceFieldLearningRule {
    id: string;
    user_id: string;
    source_id: string;
    field_name: FinanceLearnedFieldName;
    transform_type: FinanceLearnedTransformType;
    transform_value: string | null;
    evidence_count: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type FinanceParserTemplateField =
    | 'source_id'
    | 'reference_number'
    | 'merchant'
    | 'transaction_date'
    | 'direction'
    | 'payee_name'
    | 'notes'
    | 'recipient_reference'
    | 'amount';

export type FinanceParserTemplateStatus =
    | 'proposed'
    | 'shadow'
    | 'active'
    | 'rejected'
    | 'disabled';

export interface FinanceLearningTemplateCounts {
    active_source: number;
    active_field: number;
    proposed: number;
    shadow: number;
    rejected: number;
    disabled: number;
}

export interface FinanceLearningActiveMetric {
    field_name: FinanceParserTemplateField;
    template_count: number;
    minimum_precision: number | null;
    average_coverage: number | null;
}

export interface FinanceLearningRecentOutcome {
    field_name: FinanceParserTemplateField;
    status: 'rejected' | 'disabled';
    reason: string;
    updated_at: string;
}

export interface FinanceLearningLatestRun {
    status: 'succeeded' | 'failed';
    finished_at: string;
    failure_code: string | null;
    corrections_examined: number;
    category_rules_created: number;
    category_rules_updated: number;
    category_rules_disabled: number;
    reference_rules_created: number;
    reference_rules_updated: number;
    reference_rules_disabled: number;
}

export type FinanceLearningSummary =
    | { availability: 'never_run' }
    | { availability: 'unavailable' }
    | {
        availability: 'available';
        latest_run: FinanceLearningLatestRun;
        template_counts: FinanceLearningTemplateCounts;
        active_reference_rules: number;
        active_metrics: FinanceLearningActiveMetric[];
        recent_outcomes: FinanceLearningRecentOutcome[];
    };

export type FinanceParserTemplateEvidenceOutcome =
    | 'supported'
    | 'contradicted'
    | 'not_applicable'
    | 'invalid_output'
    | 'unresolved_missing_context';

export type FinanceParserTemplateType =
    | 'source_phrase'
    | 'same_line_label'
    | 'next_non_empty_line'
    | 'bounded_line_window'
    | 'allowlisted_regex_capture'
    | 'strip_prefix'
    | 'strip_suffix'
    | 'character_filter'
    | 'date_format'
    | 'numeric_separator'
    | 'direction_phrase'
    | 'saved_payee_match'
    | 'filename_date'
    | 'reference_label'
    | 'receipt_pattern';

export type FinanceParserTemplateSourceLocation =
    | 'filename'
    | 'ocr_line'
    | 'header'
    | 'footer';

export type FinanceParserTemplatePatternId =
    | 'reference_token'
    | 'iso_date'
    | 'day_first_numeric_date'
    | 'day_first_named_date'
    | 'myr_amount';

export type FinanceParserTemplateDateFormat =
    | 'yyyy-mm-dd'
    | 'dd/mm/yyyy'
    | 'dd-mm-yyyy'
    | 'dd.mm.yyyy'
    | 'dd mmm yyyy';

export interface FinanceSourcePhraseTemplateConfiguration {
    type: 'source_phrase';
    phrase: string;
    location: FinanceParserTemplateSourceLocation;
}

export interface FinanceSameLineLabelTemplateConfiguration {
    type: 'same_line_label';
    label: string;
}

export interface FinanceNextNonEmptyLineTemplateConfiguration {
    type: 'next_non_empty_line';
    label: string;
    max_lines: number;
}

export interface FinanceBoundedLineWindowTemplateConfiguration {
    type: 'bounded_line_window';
    anchor: string;
    direction: 'before' | 'after';
    max_lines: number;
}

export interface FinanceAllowlistedRegexCaptureTemplateConfiguration {
    type: 'allowlisted_regex_capture';
    pattern_id: FinanceParserTemplatePatternId;
    anchor: string | null;
}

export interface FinanceStripPrefixTemplateConfiguration {
    type: 'strip_prefix';
    value: string;
}

export interface FinanceStripSuffixTemplateConfiguration {
    type: 'strip_suffix';
    value: string;
}

export interface FinanceCharacterFilterTemplateConfiguration {
    type: 'character_filter';
    mode: 'digits_only' | 'alphanumeric_only';
}

export interface FinanceDateFormatTemplateConfiguration {
    type: 'date_format';
    input_format: FinanceParserTemplateDateFormat;
}

export interface FinanceNumericSeparatorTemplateConfiguration {
    type: 'numeric_separator';
    decimal_separator: '.' | ',';
    grouping_separator: ',' | '.' | ' ' | null;
}

export interface FinanceDirectionPhraseTemplateConfiguration {
    type: 'direction_phrase';
    phrases: string[];
    direction: FinanceTransactionDirection;
}

export interface FinanceSavedPayeeMatchTemplateConfiguration {
    type: 'saved_payee_match';
    normalization: 'canonical';
}

export interface FinanceFilenameDateTemplateConfiguration {
    type: 'filename_date';
    relative_day: 'today';
}

export interface FinanceReferenceLabelTemplateConfiguration {
    type: 'reference_label';
    label: 'wallet ref' | 'reference id' | 'reference no' | 'transaction no';
    placement: 'inline' | 'before' | 'after';
    max_lines: number;
    join: 'space' | 'concat';
}

export type FinanceApprovedReceiptPattern = 'tng_date' | 'ryt_date' | 'signed_direction' | 'tng_wallet_before' | 'tng_wallet_wrapped';

export interface FinanceReceiptPatternTemplateConfiguration {
    type: 'receipt_pattern';
    pattern: FinanceApprovedReceiptPattern;
}

export type FinanceParserTemplateConfiguration =
    | FinanceSourcePhraseTemplateConfiguration
    | FinanceSameLineLabelTemplateConfiguration
    | FinanceNextNonEmptyLineTemplateConfiguration
    | FinanceBoundedLineWindowTemplateConfiguration
    | FinanceAllowlistedRegexCaptureTemplateConfiguration
    | FinanceStripPrefixTemplateConfiguration
    | FinanceStripSuffixTemplateConfiguration
    | FinanceCharacterFilterTemplateConfiguration
    | FinanceDateFormatTemplateConfiguration
    | FinanceNumericSeparatorTemplateConfiguration
    | FinanceDirectionPhraseTemplateConfiguration
    | FinanceSavedPayeeMatchTemplateConfiguration
    | FinanceFilenameDateTemplateConfiguration
    | FinanceReferenceLabelTemplateConfiguration
    | FinanceReceiptPatternTemplateConfiguration;

export interface FinanceParserTemplateContract {
    id: string;
    user_id: string;
    target_source_id: string | null;
    scope_source_id: string | null;
    field_name: FinanceParserTemplateField;
    template_type: FinanceParserTemplateType;
    configuration: FinanceParserTemplateConfiguration;
    algorithm_version: number;
    template_version: number;
    status: FinanceParserTemplateStatus;
    evidence_count: number;
    contradiction_count: number;
    evaluation_count: number;
    precision: number | null;
    coverage: number | null;
    predecessor_template_id: string | null;
    status_reason: string | null;
    created_at: string;
    evaluated_at: string | null;
    activated_at: string | null;
    disabled_at: string | null;
    updated_at: string;
}

export type FinanceParserTemplateBaseline = Partial<Record<FinanceParserTemplateField, string | number | null>>;
export type FinanceTemplateExtraction =
    | { outcome: 'value'; value: string }
    | { outcome: 'not_applicable' | 'invalid_output' | 'unresolved_missing_context' };

export type FinanceParserTemplateEvaluationOutcome =
    | 'applied'
    | 'shadow'
    | 'conflict'
    | 'unresolved_missing_context'
    | 'not_applicable'
    | 'invalid_output';

export interface FinanceParserTemplateEvaluation {
    template_id: string;
    field_name: FinanceParserTemplateField;
    status: Extract<FinanceParserTemplateStatus, 'active' | 'shadow'>;
    outcome: FinanceParserTemplateEvaluationOutcome;
    algorithm_version?: number;
    template_version?: number;
    value_hash?: string;
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

export interface FinanceRuleSuggestionView extends Pick<
    FinanceRuleSuggestion,
    | 'id'
    | 'name'
    | 'pattern'
    | 'match_type'
    | 'category_id'
    | 'source_id'
    | 'direction'
    | 'priority'
    | 'evidence_count'
> {
    category?: Pick<FinanceReferenceOption, 'name'> | null;
    finance_source?: Pick<FinanceReferenceOption, 'name'> | null;
}

export type FinanceOcrSource = Pick<
    FinanceSource,
    'id' | 'name' | 'filename_aliases' | 'ocr_aliases' | 'is_archived'
>;

export type FinanceOcrRule = Pick<
    FinanceRule,
    | 'id'
    | 'name'
    | 'match_type'
    | 'pattern'
    | 'category_id'
    | 'source_id'
    | 'direction'
    | 'priority'
    | 'is_active'
    | 'source'
    | 'auto_created_at'
    | 'created_at'
>;

export type FinanceOcrFieldLearningRule = Pick<
    FinanceFieldLearningRule,
    | 'id'
    | 'source_id'
    | 'field_name'
    | 'transform_type'
    | 'transform_value'
    | 'evidence_count'
    | 'is_active'
    | 'created_at'
>;

export type FinanceOcrPayee = Pick<
    FinancePayee,
    'id' | 'name' | 'normalized_name' | 'is_archived'
>;

export type FinanceOcrSourceTemplate = FinanceParserTemplateContract;
export type FinanceOcrFieldTemplate = FinanceParserTemplateContract;

export interface FinanceSourceDetectionSignal {
    source_id: string;
    source_name: string;
    kind:
        | 'filename_alias'
        | 'ocr_alias'
        | 'learned_source_active'
        | 'learned_source_shadow'
        | 'rule_match';
    alias: string;
    score: number;
    template_id?: string;
    template_status?: Extract<FinanceParserTemplateStatus, 'active' | 'shadow'>;
}

export type FinanceShareBatchStatus = 'QUEUED' | 'PROCESSING' | 'CLEANING_UP';

export type FinanceShareBatchItemStatus =
    | 'QUEUED'
    | 'PROCESSING'
    | 'AUTO_CONFIRMED'
    | 'REVIEW_REQUIRED'
    | 'DUPLICATE'
    | 'FAILED';

export interface FinanceShareBatchItem {
    id: string;
    original_filename: string | null;
    status: FinanceShareBatchItemStatus;
}

export interface FinanceShareBatch {
    id: string;
    status: FinanceShareBatchStatus;
    total_files: number;
    queued_files: number;
    processing_files: number;
    completed_files: number;
    review_files: number;
    duplicate_files: number;
    failed_files: number;
    items: FinanceShareBatchItem[];
}
