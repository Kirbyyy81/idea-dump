import {
    FinanceCategoryType,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
} from '@/lib/types';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/constants';
import { isFinanceIdempotencyKey } from '@/lib/finance/transactions/idempotency';
import { getFinanceSourcePreset, normalizeFinanceSourceAliases } from '@/lib/finance/ocr/sourceDetection';
import { isFutureFinanceDate, normalizeFinanceDate, toPositiveFinanceAmount } from '@/lib/finance/values';
import {
    FINANCE_SHARE_MIME_TYPES,
    MAX_FINANCE_SHARE_BATCH_BYTES,
    MAX_FINANCE_SHARE_FILE_BYTES,
    MAX_FINANCE_SHARE_FILES,
} from '@/lib/finance/share/server';

const CATEGORY_TYPES: FinanceCategoryType[] = ['expense', 'income'];
const TRANSACTION_DIRECTIONS: FinanceTransactionDirection[] = ['expense', 'income'];
const TRANSACTION_STATUSES: FinanceTransactionStatus[] = ['confirmed', 'review', 'duplicate', 'rejected'];
const RULE_MATCH_TYPES = ['exact_phrase', 'merchant_alias', 'keyword', 'account_hint'] as const;

export type FinanceValidationResult<T> = { data: T } | { error: string };

export interface FinanceCategoryCreateInput {
    name: string;
    type: FinanceCategoryType;
    color: string | null;
    icon: string | null;
}

export interface FinanceCategoryUpdateInput {
    id: string;
    updates: Record<string, unknown>;
    archiveRequested: boolean;
}

export interface FinanceSourceCreateInput {
    name: string;
    filename_aliases: string[];
    ocr_aliases: string[];
}

export interface FinanceSourceUpdateInput {
    id: string;
    updates: Record<string, unknown>;
    archiveRequested: boolean;
}

export interface FinanceRuleInput {
    name: string;
    match_type: (typeof RULE_MATCH_TYPES)[number];
    pattern: string;
    source_id: string | null;
    category_id: string | null;
    direction: FinanceTransactionDirection | null;
    priority: number;
}

export interface FinanceRuleUpdateInput {
    id: string;
    updates: Record<string, unknown>;
}

export interface FinanceRuleSuggestionEditInput extends FinanceRuleInput {
    id: string;
}

export interface FinanceTransactionInput {
    source_id: string;
    category_id: string | null;
    direction: FinanceTransactionDirection;
    amount: number;
    currency: typeof FINANCE_V1_CURRENCY;
    merchant: string | null;
    reference_number: string | null;
    transaction_date: string;
    notes: string | null;
}

export interface FinanceReviewConfirmInput extends FinanceTransactionInput {
    candidate_id: string;
    allow_duplicate: boolean;
    duplicate_override_reason: string | null;
}

export interface FinanceShareFileInput {
    client_id: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
}

export function isFinanceUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function toRequiredFinanceText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function toNullableFinanceText(value: unknown) {
    return toRequiredFinanceText(value) || null;
}

export function toBoundedNullableFinanceText(value: unknown, maxLength: number) {
    const text = toNullableFinanceText(value);
    return text && text.length <= maxLength ? text : null;
}

export function isFinanceTextWithinLength(value: unknown, maxLength: number) {
    return value === undefined
        || value === null
        || (typeof value === 'string' && value.trim().length <= maxLength);
}

export function toFinanceInteger(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed >= -2_147_483_648 && parsed <= 2_147_483_647
        ? parsed
        : null;
}

export function normalizeFinanceReferenceNumber(value: unknown) {
    const text = toBoundedNullableFinanceText(value, 200);
    return text ? text.normalize('NFKC').toUpperCase() : null;
}

function hasValidCategoryType(value: unknown): value is FinanceCategoryType {
    return CATEGORY_TYPES.includes(value as FinanceCategoryType);
}

export function isFinanceTransactionDirection(value: unknown): value is FinanceTransactionDirection {
    return TRANSACTION_DIRECTIONS.includes(value as FinanceTransactionDirection);
}

export function isFinanceTransactionStatus(value: unknown): value is FinanceTransactionStatus {
    return TRANSACTION_STATUSES.includes(value as FinanceTransactionStatus);
}

function isFinanceRuleMatchType(value: unknown): value is (typeof RULE_MATCH_TYPES)[number] {
    return RULE_MATCH_TYPES.includes(value as (typeof RULE_MATCH_TYPES)[number]);
}

export function parseFinanceCategoryCreate(body: Record<string, unknown>): FinanceValidationResult<FinanceCategoryCreateInput> {
    const name = toRequiredFinanceText(body.name);
    if (!name) return { error: 'Category name is required' };
    if (!isFinanceTextWithinLength(body.name, 120)) return { error: 'Category name must be 120 characters or fewer' };
    if (!isFinanceTextWithinLength(body.color, 50)) return { error: 'Category color must be 50 characters or fewer' };
    if (!isFinanceTextWithinLength(body.icon, 100)) return { error: 'Category icon must be 100 characters or fewer' };
    if (!hasValidCategoryType(body.type)) return { error: 'Select a valid category type' };
    return {
        data: {
            name,
            type: body.type,
            color: toNullableFinanceText(body.color),
            icon: toNullableFinanceText(body.icon),
        },
    };
}

export function parseFinanceCategoryUpdate(body: Record<string, unknown>): FinanceValidationResult<FinanceCategoryUpdateInput> {
    const id = toRequiredFinanceText(body.id);
    if (!id) return { error: 'Category ID is required' };
    if (!isFinanceUuid(id)) return { error: 'Category ID must be a valid UUID' };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
        const name = toRequiredFinanceText(body.name);
        if (!name) return { error: 'Category name is required' };
        if (!isFinanceTextWithinLength(body.name, 120)) return { error: 'Category name must be 120 characters or fewer' };
        updates.name = name;
    }
    if (body.type !== undefined) {
        if (!hasValidCategoryType(body.type)) return { error: 'Select a valid category type' };
        updates.type = body.type;
    }
    if (body.color !== undefined) {
        if (!isFinanceTextWithinLength(body.color, 50)) return { error: 'Category color must be 50 characters or fewer' };
        updates.color = toNullableFinanceText(body.color);
    }
    if (body.icon !== undefined) {
        if (!isFinanceTextWithinLength(body.icon, 100)) return { error: 'Category icon must be 100 characters or fewer' };
        updates.icon = toNullableFinanceText(body.icon);
    }
    if (body.is_archived !== undefined) {
        if (typeof body.is_archived !== 'boolean') return { error: 'Archived state must be true or false' };
        updates.is_archived = body.is_archived;
    }
    const archiveRequested = body.is_archived !== undefined;
    if (archiveRequested) {
        const combinedFields = Object.keys(updates).filter((key) => !['updated_at', 'is_archived'].includes(key));
        if (combinedFields.length > 0) return { error: 'Archive or restore a category separately from other edits' };
    }
    return { data: { id, updates, archiveRequested } };
}

export function parseFinanceSourceCreate(body: Record<string, unknown>): FinanceValidationResult<FinanceSourceCreateInput> {
    const name = toRequiredFinanceText(body.name);
    if (!name) return { error: 'Source name is required' };
    if (!isFinanceTextWithinLength(body.name, 120)) return { error: 'Source name must be 120 characters or fewer' };
    const preset = getFinanceSourcePreset(name);
    const filenameAliases = body.filename_aliases === undefined
        ? preset.filenameAliases
        : normalizeFinanceSourceAliases(body.filename_aliases);
    const ocrAliases = body.ocr_aliases === undefined
        ? preset.ocrAliases
        : normalizeFinanceSourceAliases(body.ocr_aliases);
    if (!filenameAliases) return { error: 'Filename aliases must contain up to 20 non-empty values of 120 characters or fewer' };
    if (!ocrAliases) return { error: 'OCR aliases must contain up to 20 non-empty values of 120 characters or fewer' };
    return { data: { name, filename_aliases: filenameAliases, ocr_aliases: ocrAliases } };
}

export function parseFinanceSourceUpdate(body: Record<string, unknown>): FinanceValidationResult<FinanceSourceUpdateInput> {
    const id = toRequiredFinanceText(body.id);
    if (!id) return { error: 'Source ID is required' };
    if (!isFinanceUuid(id)) return { error: 'Source ID must be a valid UUID' };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
        const name = toRequiredFinanceText(body.name);
        if (!name) return { error: 'Source name is required' };
        if (!isFinanceTextWithinLength(body.name, 120)) return { error: 'Source name must be 120 characters or fewer' };
        updates.name = name;
    }
    if (body.is_archived !== undefined) {
        if (typeof body.is_archived !== 'boolean') return { error: 'Archived state must be true or false' };
        updates.is_archived = body.is_archived;
    }
    if (body.filename_aliases !== undefined) {
        const aliases = normalizeFinanceSourceAliases(body.filename_aliases);
        if (!aliases) return { error: 'Filename aliases must contain up to 20 non-empty values of 120 characters or fewer' };
        updates.filename_aliases = aliases;
    }
    if (body.ocr_aliases !== undefined) {
        const aliases = normalizeFinanceSourceAliases(body.ocr_aliases);
        if (!aliases) return { error: 'OCR aliases must contain up to 20 non-empty values of 120 characters or fewer' };
        updates.ocr_aliases = aliases;
    }
    if (Object.keys(updates).length === 1) return { error: 'No source changes were provided' };
    const archiveRequested = body.is_archived !== undefined;
    if (archiveRequested) {
        const combinedFields = Object.keys(updates).filter((key) => !['updated_at', 'is_archived'].includes(key));
        if (combinedFields.length > 0) return { error: 'Archive or restore a source separately from other edits' };
    }
    return { data: { id, updates, archiveRequested } };
}

function parseFinanceRuleValues(
    body: Record<string, unknown>,
    options: { partial: boolean }
): FinanceValidationResult<Partial<FinanceRuleInput>> {
    const values: Partial<FinanceRuleInput> = {};
    if (!options.partial || body.name !== undefined) {
        const name = toRequiredFinanceText(body.name);
        if (!name) return { error: 'Rule name is required' };
        if (!isFinanceTextWithinLength(body.name, 120)) return { error: 'Rule name must be 120 characters or fewer' };
        values.name = name;
    }
    if (!options.partial || body.pattern !== undefined) {
        const pattern = toRequiredFinanceText(body.pattern);
        if (!pattern) return { error: 'Match pattern is required' };
        if (!isFinanceTextWithinLength(body.pattern, 500)) return { error: 'Match pattern must be 500 characters or fewer' };
        values.pattern = pattern;
    }
    if (!options.partial || body.match_type !== undefined) {
        if (!isFinanceRuleMatchType(body.match_type)) return { error: 'Select a valid match type' };
        values.match_type = body.match_type;
    }
    if (!options.partial || body.source_id !== undefined) {
        const sourceId = toNullableFinanceText(body.source_id);
        if (sourceId && !isFinanceUuid(sourceId)) return { error: 'Source ID must be a valid UUID' };
        values.source_id = sourceId;
    }
    if (!options.partial || body.category_id !== undefined) {
        const categoryId = toNullableFinanceText(body.category_id);
        if (categoryId && !isFinanceUuid(categoryId)) return { error: 'Category ID must be a valid UUID' };
        values.category_id = categoryId;
    }
    if (!options.partial || body.direction !== undefined) {
        const direction = body.direction === undefined || body.direction === null || body.direction === ''
            ? null
            : isFinanceTransactionDirection(body.direction)
                ? body.direction
                : undefined;
        if (direction === undefined) return { error: 'Select a valid direction' };
        values.direction = direction;
    }
    if (!options.partial || body.priority !== undefined) {
        const priority = body.priority === undefined ? 100 : toFinanceInteger(body.priority);
        if (priority === null) return { error: 'Priority must be a valid whole number' };
        values.priority = priority;
    }
    return { data: values };
}

export function parseFinanceRuleCreate(body: Record<string, unknown>): FinanceValidationResult<FinanceRuleInput> {
    const parsed = parseFinanceRuleValues(body, { partial: false });
    if ('error' in parsed) return parsed;
    return { data: parsed.data as FinanceRuleInput };
}

export function parseFinanceRuleUpdate(body: Record<string, unknown>): FinanceValidationResult<FinanceRuleUpdateInput> {
    const id = toRequiredFinanceText(body.id);
    if (!id) return { error: 'Rule ID is required' };
    if (!isFinanceUuid(id)) return { error: 'Rule ID must be a valid UUID' };
    const parsed = parseFinanceRuleValues(body, { partial: true });
    if ('error' in parsed) return parsed;
    const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
    if (body.is_active !== undefined) {
        if (typeof body.is_active !== 'boolean') return { error: 'Active state must be true or false' };
        updates.is_active = body.is_active;
    }
    return { data: { id, updates } };
}

export function parseFinanceRuleSuggestionEdit(body: Record<string, unknown>): FinanceValidationResult<FinanceRuleSuggestionEditInput> {
    const id = toRequiredFinanceText(body.id);
    if (!id) return { error: 'Suggestion ID is required' };
    if (!isFinanceUuid(id)) return { error: 'Suggestion ID must be a valid UUID' };
    const parsed = parseFinanceRuleValues(body, { partial: false });
    if ('error' in parsed) return parsed;
    const categoryId = toRequiredFinanceText(body.category_id);
    if (!categoryId) return { error: 'Category is required' };
    if (!isFinanceUuid(categoryId)) return { error: 'Category ID must be a valid UUID' };
    return { data: { id, ...parsed.data as FinanceRuleInput, category_id: categoryId } };
}

export function parseFinanceTransaction(
    body: Record<string, unknown>,
    today: string
): FinanceValidationResult<FinanceTransactionInput> {
    const sourceId = toRequiredFinanceText(body.source_id);
    const amount = toPositiveFinanceAmount(body.amount);
    const transactionDate = normalizeFinanceDate(body.transaction_date);
    const categoryId = toNullableFinanceText(body.category_id);
    if (!sourceId) return { error: 'Source is required' };
    if (!isFinanceUuid(sourceId)) return { error: 'Source ID must be a valid UUID' };
    if (categoryId && !isFinanceUuid(categoryId)) return { error: 'Category ID must be a valid UUID' };
    if (!amount) return { error: 'Amount must be positive, within range, and use at most two decimals' };
    if (!isFinanceTransactionDirection(body.direction)) return { error: 'Select a valid transaction direction' };
    if (!transactionDate) return { error: 'Transaction date is required' };
    if (isFutureFinanceDate(transactionDate, today)) return { error: 'Transaction date cannot be in the future' };
    if (!isFinanceTextWithinLength(body.merchant, 500)) return { error: 'Merchant must be 500 characters or fewer' };
    if (!isFinanceTextWithinLength(body.notes, 2000)) return { error: 'Notes must be 2,000 characters or fewer' };
    if (!isFinanceTextWithinLength(body.reference_number, 200)) return { error: 'Reference number must be 200 characters or fewer' };
    return {
        data: {
            source_id: sourceId,
            category_id: categoryId,
            direction: body.direction,
            amount,
            currency: FINANCE_V1_CURRENCY,
            merchant: toNullableFinanceText(body.merchant),
            reference_number: normalizeFinanceReferenceNumber(body.reference_number),
            transaction_date: transactionDate,
            notes: toNullableFinanceText(body.notes),
        },
    };
}

export function parseManualFinanceTransactionCreate(
    body: Record<string, unknown>,
    today: string
): FinanceValidationResult<FinanceTransactionInput & { idempotency_key: string }> {
    const idempotencyKey = toRequiredFinanceText(body.idempotency_key);
    if (!idempotencyKey) return { error: 'Transaction request ID is required' };
    if (!isFinanceIdempotencyKey(idempotencyKey)) return { error: 'Transaction request ID must be a valid UUID' };
    const parsed = parseFinanceTransaction(body, today);
    if ('error' in parsed) return parsed;
    return { data: { ...parsed.data, idempotency_key: idempotencyKey } };
}

export function parseFinanceReviewAction(body: Record<string, unknown>): FinanceValidationResult<{ candidate_id: string; action: string }> {
    const candidateId = toRequiredFinanceText(body.candidate_id);
    const action = toRequiredFinanceText(body.action);
    if (!candidateId) return { error: 'Candidate ID is required' };
    if (!isFinanceUuid(candidateId)) return { error: 'Candidate ID must be a valid UUID' };
    return { data: { candidate_id: candidateId, action } };
}

export function parseFinanceReviewConfirm(
    body: Record<string, unknown>,
    today: string
): FinanceValidationResult<FinanceReviewConfirmInput> {
    const candidateId = toRequiredFinanceText(body.candidate_id);
    if (!candidateId || !isFinanceUuid(candidateId)) {
        return { error: !candidateId ? 'Candidate ID is required' : 'Candidate ID must be a valid UUID' };
    }
    const parsed = parseFinanceTransaction(body, today);
    if ('error' in parsed) return parsed;
    if (!isFinanceTextWithinLength(body.duplicate_override_reason, 500)) {
        return { error: 'Duplicate override reason must be 500 characters or fewer' };
    }
    return {
        data: {
            ...parsed.data,
            candidate_id: candidateId,
            allow_duplicate: body.allow_duplicate === true,
            duplicate_override_reason: toBoundedNullableFinanceText(body.duplicate_override_reason, 500),
        },
    };
}

export function parseFinanceSharePrepare(body: Record<string, unknown>): FinanceValidationResult<{ request_id: string; files: FinanceShareFileInput[] }> {
    const requestId = toRequiredFinanceText(body.request_id);
    const files = parseFinanceShareFiles(body.files);
    if (!isFinanceUuid(requestId) || !files) {
        return { error: 'Choose 1 to 10 valid PNG, JPEG, or WebP images up to 4 MB each' };
    }
    return { data: { request_id: requestId, files } };
}

export function parseFinanceShareCommit(body: Record<string, unknown>): FinanceValidationResult<{ batch_id: string; reservation_id: string }> {
    const batchId = toRequiredFinanceText(body.batch_id);
    const reservationId = toRequiredFinanceText(body.reservation_id);
    if (!isFinanceUuid(batchId) || !isFinanceUuid(reservationId)) {
        return { error: 'Batch and reservation IDs must be valid UUIDs' };
    }
    return { data: { batch_id: batchId, reservation_id: reservationId } };
}

function parseFinanceShareFiles(value: unknown): FinanceShareFileInput[] | null {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FINANCE_SHARE_FILES) return null;
    const files: FinanceShareFileInput[] = [];
    const clientIds = new Set<string>();
    let totalBytes = 0;
    for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const file = entry as Record<string, unknown>;
        const clientId = toRequiredFinanceText(file.client_id);
        const name = toRequiredFinanceText(file.name);
        const mimeType = typeof file.mime_type === 'string' ? file.mime_type.trim().toLowerCase() : '';
        const fileSize = Number(file.size);
        if (
            !isFinanceUuid(clientId)
            || clientIds.has(clientId)
            || !name
            || name.length > 255
            || /[\u0000-\u001f\u007f]/.test(name)
            || !FINANCE_SHARE_MIME_TYPES.has(mimeType)
            || !Number.isSafeInteger(fileSize)
            || fileSize < 1
            || fileSize > MAX_FINANCE_SHARE_FILE_BYTES
        ) {
            return null;
        }
        clientIds.add(clientId);
        totalBytes += fileSize;
        files.push({
            client_id: clientId,
            original_filename: name,
            mime_type: mimeType,
            file_size: fileSize,
        });
    }
    return totalBytes <= MAX_FINANCE_SHARE_BATCH_BYTES ? files : null;
}
